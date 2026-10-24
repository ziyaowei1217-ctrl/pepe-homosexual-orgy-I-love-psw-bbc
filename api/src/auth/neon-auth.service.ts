import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { NeonAuthConfig } from "./auth-provider";
import { NEON_AUTH_CONFIG } from "./auth.tokens";
import { AuthRateLimiter } from "./auth-rate-limit";
import { isAcademicEmail } from "./academic-email";
import { acquireNormalizedEmailAdvisoryLock } from "./email-advisory-lock";
import { NeonTokenVerifier, type NeonVerifiedIdentity } from "./neon-token-verifier";

@Injectable()
export class NeonAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(NeonTokenVerifier) private readonly verifier: NeonTokenVerifier,
    @Inject(NEON_AUTH_CONFIG) private readonly config: NeonAuthConfig | undefined,
    @Inject(AuthRateLimiter) private readonly rateLimiter?: AuthRateLimiter
  ) {}

  async exchange(token: string) {
    if (!this.config) throw new ServiceUnavailableException({ code: "IDENTITY_PROVIDER_UNAVAILABLE", message: "External sign-in is not enabled" });
    const identity = await this.verifier.verify(token);
    if (!this.rateLimiter && process.env.NODE_ENV === "production") throw new ServiceUnavailableException({ code: "AUTH_DELIVERY_UNAVAILABLE", message: "Authentication is temporarily unavailable" });
    await this.rateLimiter?.enforce("identity", "LOGIN", { email: identity.email, ip: "verified-provider", actorId: JSON.stringify([identity.issuer, identity.subject]) });
    const result = await this.bindIdentity(identity);
    if (identity.expiresAt <= Date.now()) throw new UnauthorizedException("Identity token expired");
    const user = { id: result.user.id, email: result.user.email, role: result.user.role };
    // A separately issued one-hour app session uses only current application database roles.
    // It never carries an upstream bearer token or administrator step-up assertion.
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role }, { algorithm: "HS256", expiresIn: "1h" });
    return { accessToken, user, isNewUser: result.isNewUser };
  }

  private async bindIdentity(identity: NeonVerifiedIdentity) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const provider = "neon";
          const subjectKey = `external-auth:${identity.issuer}:${identity.subject}`;
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subjectKey}::text, 0))`;
          await acquireNormalizedEmailAdvisoryLock(transaction, identity.email);
          const binding = await transaction.externalAuthIdentity.findUnique({
            where: { provider_issuer_subject: { provider, issuer: identity.issuer, subject: identity.subject } }, include: { user: true }
          });
          if (binding) {
            if (binding.user.email !== identity.email) throw new UnauthorizedException("Verified identity does not match this account");
            await transaction.profile.upsert(profileUpsert(identity));
            return { user: binding.user, isNewUser: false };
          }
          let user = await transaction.user.findUnique({ where: { email: identity.email } });
          const isNewUser = !user;
          if (!user) {
            const invitation = await transaction.betaInvite.updateMany({
              where: { normalizedEmail: identity.email, claimedAt: null, revokedAt: null }, data: { claimedAt: new Date() }
            });
            if (!this.config!.publicSignup && invitation.count !== 1) throw new UnauthorizedException("This account has not been invited");
            user = await transaction.user.create({ data: { email: identity.email, role: "USER" } });
          }
          const previousIdentity = await transaction.externalAuthIdentity.findUnique({ where: { provider_issuer_userId: { provider, issuer: identity.issuer, userId: user.id } } });
          if (previousIdentity) throw new UnauthorizedException("This account is already bound to another verified identity");
          await transaction.externalAuthIdentity.create({ data: { provider, issuer: identity.issuer, subject: identity.subject, userId: user.id } });
          await transaction.profile.upsert(profileUpsert(identity));
          return { user, isNewUser };
        });
      } catch (error) {
        // Retry only known concurrent identity/unique-key races in a fresh transaction.
        if (attempt === 0 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue;
        throw error;
      }
    }
  }
}

// Every exchanged identity has a provider-verified email (a code was delivered to it,
// or the identity provider vouched for it), so a school address proves school email
// ownership. The flag is only ever raised here; nothing user-editable sets it.
function profileUpsert(identity: NeonVerifiedIdentity) {
  const school = isAcademicEmail(identity.email) ? { eduEmailVerified: true } : {};
  return {
    where: { email: identity.email },
    update: school,
    create: { email: identity.email, ...(identity.name ? { displayName: identity.name } : {}), ...school }
  };
}
