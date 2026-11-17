import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { isPhoneAccountEmail, newPhoneAccountEmail } from "./phone-account";
import { maskPhoneNumber, normalizePhoneNumber } from "./phone-number";
import { PhoneVerificationUnavailableError, type PhoneAuthConfig, type PhoneVerificationProvider } from "./phone-verification-provider";
import { NEON_AUTH_CONFIG, PHONE_AUTH_CONFIG } from "./auth.tokens";
import { AuthRateLimiter, AuthRateLimitException, type AuthRateLimitPurpose } from "./auth-rate-limit";
import type { NeonAuthConfig } from "./auth-provider";
import { applicationSessionSeconds } from "./application-session";

export const PHONE_CODE_TTL_SECONDS = 600;
// Linking, replacing or removing a sign-in phone needs a session at most this old.
export const RECENT_SIGN_IN_MS = 15 * 60 * 1000;
// Phone routes have no account email, so the rate limiter's email slot holds
// a fixed placeholder; per-number limits use the normalized number.
export const PHONE_LIMIT_EMAIL = "phone-sign-in@psw.invalid";
// A phone used for administrator step-up must have been linked at least this
// long ago, so a stolen administrator session (one hour, application-session.ts)
// expires before a phone it adds could be used for step-up.
export const ADMIN_STEP_UP_PHONE_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export { isPhoneAccountEmail, newPhoneAccountEmail, PHONE_ACCOUNT_EMAIL_DOMAIN } from "./phone-account";

@Injectable()
export class PhoneAuthService {
  private readonly logger = new Logger(PhoneAuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PHONE_AUTH_CONFIG) private readonly config: PhoneAuthConfig,
    @Inject(AuthRateLimiter) private readonly rateLimiter: AuthRateLimiter,
    @Optional() @Inject(NEON_AUTH_CONFIG) private readonly neonConfig?: NeonAuthConfig
  ) {}

  availability() {
    return this.config.enabled
      ? { enabled: true, regions: this.config.regions, signUp: this.signUpAllowed() }
      : { enabled: false, regions: [], signUp: false };
  }

  // A new number may create an account only where the deployment admits new
  // users without an invitation (Neon mode with PUBLIC_BETA_SIGNUP=true).
  // Invitations are keyed by email, which a phone-only sign-up does not have.
  private signUpAllowed() {
    return this.neonConfig?.publicSignup === true;
  }

  // Validates format and region. Throws before any rate limit is consumed for a
  // number the deployment would never text.
  normalize(input: unknown) {
    const { regions } = this.requireEnabled();
    const phoneNumber = normalizePhoneNumber(input, regions);
    if (!phoneNumber) throw new BadRequestException({ code: "INVALID_PHONE_NUMBER", message: "Enter a supported mobile number" });
    return phoneNumber;
  }

  // Codes are texted to numbers linked to an account and, where public sign-up
  // is on, to new numbers so they can create one. The response is identical in
  // every case, so it reveals nothing about which numbers exist. Without public
  // sign-up nobody can make the service text an unlinked number.
  // `requesterIp` (from getRequestIdentity) charges a sign-up text to the
  // requester's network as well as to the site-wide budget.
  async requestSignInCode(phoneNumber: string, requesterIp = "unknown") {
    const { provider } = this.requireEnabled();
    const startedAt = Date.now();
    const identity = await this.prisma.phoneIdentity.findUnique({ where: { phoneNumber }, select: { user: { select: { role: true } } } });
    const accepted = { phoneNumber: maskPhoneNumber(phoneNumber), expiresInSeconds: PHONE_CODE_TTL_SECONDS };
    // Administrators sign in with Google or email; their phone is only a step-up
    // factor, so a phone alone never opens an administrator account.
    const purpose: AuthRateLimitPurpose | null = identity
      ? identity.user.role !== "ADMIN" ? "PHONE_LOGIN" : null
      : this.signUpAllowed() ? "PHONE_SIGNUP" : null;
    if (purpose) {
      if (provider.name === "development") {
        const result = await provider.start(phoneNumber);
        if (result.status === "sent" && result.devCode) return { ...accepted, devCode: result.devCode };
      } else {
        // Sent in the background so response time does not depend on the provider.
        void this.deliverQuietly(purpose, provider, phoneNumber, requesterIp);
      }
    }
    await this.padResponse(startedAt);
    return accepted;
  }

  async verifySignInCode(phoneNumber: string, code: string) {
    const { provider } = this.requireEnabled();
    const startedAt = Date.now();
    const identity = await this.prisma.phoneIdentity.findUnique({ where: { phoneNumber }, include: { user: true } });
    const eligible = identity && identity.user.role !== "ADMIN" ? identity : null;
    const signUp = !identity && this.signUpAllowed();
    // A code is checked with the provider only when it could open an account:
    // a linked number that is not an administrator's, or with public sign-up
    // a number that belongs to no account. Guesses at an administrator's number
    // never reach the provider, so they cannot use up a step-up code. With
    // public sign-up, guesses at a free number do reach it and count against a
    // link code someone may be waiting for on that number (Twilio Verify keeps
    // one pending code per number and stops it after five wrong checks); the
    // per-number verify limits bound that, and the user can ask for a new code.
    // The padded response hides which case applied.
    const result = eligible || signUp ? await this.check(provider, phoneNumber, code) : "invalid";
    await this.padResponse(startedAt);
    if (result !== "approved" || (!eligible && !signUp)) throw new UnauthorizedException({ code: "INVALID_PHONE_CODE", message: "Invalid or expired verification code" });
    const { user, isNewUser } = eligible ? { user: eligible.user, isNewUser: false } : await this.createPhoneAccount(phoneNumber);
    const sessionUser = { id: user.id, email: user.email, role: user.role };
    if (!isNewUser) {
      await this.audit.append(this.prisma, {
        actorType: "USER", actorUserId: sessionUser.id, action: "PHONE_SIGN_IN", targetType: "USER", targetId: sessionUser.id, outcome: "SUCCESS"
      });
    }
    // Same application session as other sign-in methods (application-session.ts).
    // It never carries an administrator step-up assertion.
    const accessToken = await this.jwt.signAsync({ sub: sessionUser.id, email: sessionUser.email, role: sessionUser.role }, { algorithm: "HS256", expiresIn: applicationSessionSeconds(sessionUser.role) });
    return { accessToken, user: sessionUser, isNewUser };
  }

  // Creates an ordinary USER account owned by a just-verified number. If the
  // number was linked to an account meanwhile, that account signs in instead
  // (it was proven by the same code), unless it is an administrator's.
  private async createPhoneAccount(phoneNumber: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-identity:${phoneNumber}`}::text, 0))`;
          const existing = await transaction.phoneIdentity.findUnique({ where: { phoneNumber }, include: { user: true } });
          if (existing) {
            if (existing.user.role === "ADMIN") throw new UnauthorizedException({ code: "INVALID_PHONE_CODE", message: "Invalid or expired verification code" });
            return { user: existing.user, isNewUser: false };
          }
          const email = newPhoneAccountEmail();
          const now = new Date();
          const user = await transaction.user.create({ data: { email, role: "USER" } });
          await transaction.phoneIdentity.create({ data: { userId: user.id, phoneNumber, verifiedAt: now } });
          await transaction.profile.upsert({ where: { email }, update: { phoneVerified: true }, create: { email, phoneVerified: true } });
          await this.audit.append(transaction, {
            actorType: "USER", actorUserId: user.id, action: "PHONE_SIGN_UP", targetType: "USER", targetId: user.id, outcome: "SUCCESS"
          });
          return { user, isNewUser: true };
        });
      } catch (error) {
        // A concurrent link or sign-up for the same number: retry once, which signs in to that account.
        if (attempt === 0 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue;
        throw error;
      }
    }
  }

  // `admin` is the role as stored now (the session's user is re-read on every request), so a page opened before the
  // role changed still shows an administrator's number as the operator-only step-up number it is.
  async status(user: { id: string; role: string }) {
    const identity = await this.prisma.phoneIdentity.findUnique({ where: { userId: user.id }, select: { phoneNumber: true, verifiedAt: true } });
    return {
      ...this.availability(),
      linked: Boolean(identity),
      phoneNumber: identity ? maskPhoneNumber(identity.phoneNumber) : null,
      verifiedAt: identity?.verifiedAt ?? null,
      admin: user.role === "ADMIN"
    };
  }

  // Changing the sign-in phone needs a recent sign-in, so an older stolen
  // session cannot add the thief's phone as a lasting way back in.
  async requestLinkCode(user: { id: string; role: string }, phoneNumber: string, sessionIssuedAt: number | undefined) {
    const { provider } = this.requireEnabled();
    assertRecentSignIn(sessionIssuedAt);
    await this.assertAdminPhoneUnlocked(user);
    const startedAt = Date.now();
    const existing = await this.prisma.phoneIdentity.findUnique({ where: { phoneNumber }, select: { userId: true } });
    const accepted = { phoneNumber: maskPhoneNumber(phoneNumber), expiresInSeconds: PHONE_CODE_TTL_SECONDS };
    // A number linked to another account is not texted, and the response is the
    // same as for a free number, so linking cannot be used to look numbers up.
    if (!existing || existing.userId === user.id) {
      if (provider.name === "development") {
        const result = await this.start(provider, phoneNumber);
        if (result.devCode) return { ...accepted, devCode: result.devCode };
      } else {
        void this.deliverQuietly("PHONE_LINK", provider, phoneNumber);
      }
    }
    await this.padResponse(startedAt);
    return accepted;
  }

  async verifyLinkCode(user: { id: string; email: string; role: string }, phoneNumber: string, code: string, sessionIssuedAt: number | undefined) {
    const { provider } = this.requireEnabled();
    assertRecentSignIn(sessionIssuedAt);
    await this.assertAdminPhoneUnlocked(user);
    const startedAt = Date.now();
    const owner = await this.prisma.phoneIdentity.findUnique({ where: { phoneNumber }, select: { userId: true } });
    // Another account's number is never checked with the provider: that would
    // consume its owner's pending code. It fails like a wrong code.
    const result = owner && owner.userId !== user.id ? "invalid" : await this.check(provider, phoneNumber, code);
    await this.padResponse(startedAt);
    // 400, not 401: a wrong code must not look like an expired account session.
    if (result !== "approved") throw new BadRequestException({ code: "INVALID_PHONE_CODE", message: "Invalid or expired verification code" });
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // One link change per account at a time.
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-link:${user.id}`}::text, 0))`;
        const currentOwner = await transaction.phoneIdentity.findUnique({ where: { phoneNumber }, select: { userId: true } });
        if (currentOwner && currentOwner.userId !== user.id) throw phoneUnavailable();
        // Re-checked inside the transaction: the role is read from the database.
        const current = await transaction.user.findUnique({ where: { id: user.id }, select: { role: true, phoneIdentity: { select: { id: true } } } });
        if (!current) throw new UnauthorizedException("Invalid bearer token");
        const now = new Date();
        if (current.role === "ADMIN") {
          if (current.phoneIdentity) throw adminPhoneLocked();
          await transaction.phoneIdentity.create({ data: { userId: user.id, phoneNumber, verifiedAt: now } });
        } else {
          await transaction.phoneIdentity.upsert({
            where: { userId: user.id },
            update: { phoneNumber, verifiedAt: now },
            create: { userId: user.id, phoneNumber, verifiedAt: now }
          });
        }
        await transaction.profile.upsert({ where: { email: user.email }, update: { phoneVerified: true }, create: { email: user.email, phoneVerified: true } });
        await this.audit.append(transaction, {
          actorType: "USER", actorUserId: user.id, action: "PHONE_LINKED", targetType: "USER", targetId: user.id, outcome: "SUCCESS"
        });
        return { linked: true, phoneNumber: maskPhoneNumber(phoneNumber), verifiedAt: now, admin: current.role === "ADMIN" };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw phoneUnavailable();
      throw error;
    }
  }

  async unlink(user: { id: string; email: string; role: string }, sessionIssuedAt: number | undefined) {
    assertRecentSignIn(sessionIssuedAt);
    await this.assertAdminPhoneUnlocked(user);
    return this.prisma.$transaction(async (transaction) => {
      // An account created by phone has a placeholder address that receives no mail, so unless Google or email
      // sign-in was bound to it, this number is its only way in. It may move to another number (link one), but
      // removing the last one would lock it out and a later sign-in with the same number would start a new account.
      const current = await transaction.user.findUnique({ where: { id: user.id }, select: { email: true } });
      if (current && isPhoneAccountEmail(current.email) && await transaction.externalAuthIdentity.count({ where: { userId: user.id } }) === 0) {
        throw new ConflictException({ code: "PHONE_REQUIRED_FOR_ACCOUNT", message: "This number is the only way to sign in to this account; link another number to change it" });
      }
      const removed = await transaction.phoneIdentity.deleteMany({ where: { userId: user.id } });
      await transaction.profile.updateMany({ where: { email: user.email }, data: { phoneVerified: false } });
      if (removed.count) {
        await this.audit.append(transaction, {
          actorType: "USER", actorUserId: user.id, action: "PHONE_UNLINKED", targetType: "USER", targetId: user.id, outcome: "SUCCESS"
        });
      }
      return { linked: false };
    });
  }

  // Administrator step-up: a fresh code texted to the administrator's own
  // linked number. The proof lasts 30 minutes, matching the step-up guard.
  async requestAdminStepUpCode(userId: string) {
    const { provider } = this.requireEnabled();
    const identity = await this.stepUpPhone(userId);
    await this.rateLimiter.enforce("deliver", "PHONE_STEP_UP", { email: PHONE_LIMIT_EMAIL, ip: "service", subject: identity.phoneNumber });
    const result = await this.start(provider, identity.phoneNumber);
    return { phoneNumber: maskPhoneNumber(identity.phoneNumber), expiresInSeconds: PHONE_CODE_TTL_SECONDS, ...(result.devCode ? { devCode: result.devCode } : {}) };
  }

  async verifyAdminStepUpCode(user: { id: string; email: string; role: string }, code: string) {
    const { provider } = this.requireEnabled();
    const identity = await this.stepUpPhone(user.id);
    const result = await this.check(provider, identity.phoneNumber, code);
    // The role is re-read so a revoked administrator cannot finish step-up.
    const current = await this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, role: true } });
    if (current?.role !== "ADMIN") throw new ForbiddenException({ code: "ADMIN_REQUIRED", message: "Administrator access is required" });
    // 400, not 401: a wrong code must not look like an expired account session.
    if (result !== "approved") throw new BadRequestException({ code: "INVALID_PHONE_CODE", message: "Invalid or expired verification code" });
    const adminReauthenticatedAt = Math.floor(Date.now() / 1000);
    await this.audit.append(this.prisma, {
      actorType: "USER", actorUserId: current.id, actorEmail: current.email, action: "ADMIN_STEP_UP_VERIFIED", targetType: "USER", targetId: current.id, outcome: "SUCCESS",
      metadata: { method: "POST", reason: "phone" }
    });
    return {
      accessToken: await this.jwt.signAsync({ sub: current.id, email: current.email, role: "ADMIN", adminReauthenticatedAt }, { algorithm: "HS256", expiresIn: "1h" }),
      reauthenticatedUntil: new Date((adminReauthenticatedAt + 30 * 60) * 1000)
    };
  }

  private async stepUpPhone(userId: string) {
    const identity = await this.prisma.phoneIdentity.findUnique({ where: { userId }, select: { phoneNumber: true, verifiedAt: true } });
    if (!identity) throw new ConflictException({ code: "PHONE_NOT_LINKED", message: "Link a verified phone number before administrator verification" });
    if (Date.now() - identity.verifiedAt.getTime() < ADMIN_STEP_UP_PHONE_MIN_AGE_MS) {
      throw new ConflictException({ code: "PHONE_TOO_NEW", message: "A newly linked phone can be used for administrator verification after 24 hours" });
    }
    return identity;
  }

  // An administrator may add a first phone, but not replace or remove it here:
  // otherwise one stolen session could redirect future step-up codes.
  private async assertAdminPhoneUnlocked(user: { id: string; role: string }) {
    if (user.role !== "ADMIN") return;
    const existing = await this.prisma.phoneIdentity.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) throw adminPhoneLocked();
  }

  assertEnabled() {
    this.requireEnabled();
  }

  private requireEnabled(): { provider: PhoneVerificationProvider; regions: Extract<PhoneAuthConfig, { enabled: true }>["regions"] } {
    if (!this.config.enabled) throw new ServiceUnavailableException({ code: "PHONE_AUTH_UNAVAILABLE", message: "Phone sign-in is not enabled" });
    return this.config;
  }

  private async start(provider: PhoneVerificationProvider, phoneNumber: string) {
    let result;
    try { result = await provider.start(phoneNumber); }
    catch (error) { throw unavailable(error); }
    if (result.status === "rate_limited") throw new ServiceUnavailableException({ code: "PHONE_RATE_LIMITED", message: "Too many codes were sent to this number. Try again later." });
    if (result.status === "rejected") throw new BadRequestException({ code: "PHONE_NUMBER_REJECTED", message: "This number cannot receive verification texts" });
    return result;
  }

  // Charges the per-purpose delivery budget, then sends. Failures stay silent
  // because the caller has already answered the same way for every number.
  private async deliverQuietly(purpose: AuthRateLimitPurpose, provider: PhoneVerificationProvider, phoneNumber: string, requesterIp = "service") {
    try {
      await this.rateLimiter.enforce("deliver", purpose, { email: PHONE_LIMIT_EMAIL, ip: requesterIp, subject: phoneNumber });
    } catch (error) {
      if (!(error instanceof AuthRateLimitException)) this.logger.error("Phone code not sent: the rate-limit store is unavailable", { purpose });
      // A new number then gets no text and sees no error, so the operator has to hear about it.
      else if (purpose === "PHONE_SIGNUP") this.logger.error("Phone sign-up code not sent: sign-up text limit reached (100 a day for the site, 10 a minute, 30 a day from one network)", { purpose });
      else this.logger.warn("Phone code delivery budget reached", { purpose });
      return;
    }
    try {
      const result = await provider.start(phoneNumber);
      if (result.status !== "sent") this.logger.warn("Phone code was not sent", { purpose, status: result.status });
    } catch {
      this.logger.warn("Phone code delivery failed", { purpose });
    }
  }

  private async padResponse(startedAt: number) {
    const floor = this.config.enabled ? this.config.responseFloorMs ?? 0 : 0;
    const remaining = startedAt + floor - Date.now();
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private async check(provider: PhoneVerificationProvider, phoneNumber: string, code: string) {
    if (!/^\d{6}$/.test(code)) return "invalid" as const;
    try { return await provider.check(phoneNumber, code); }
    catch (error) { throw unavailable(error); }
  }
}

function assertRecentSignIn(sessionIssuedAt: number | undefined) {
  if (sessionIssuedAt === undefined || Date.now() - sessionIssuedAt > RECENT_SIGN_IN_MS) {
    throw new ForbiddenException({ code: "RECENT_SIGN_IN_REQUIRED", message: "Sign in again to change your phone number" });
  }
}

function adminPhoneLocked() {
  return new ForbiddenException({ code: "ADMIN_PHONE_LOCKED", message: "An administrator's linked phone can only be changed by an operator" });
}

function phoneUnavailable() {
  return new ConflictException({ code: "PHONE_NUMBER_UNAVAILABLE", message: "This number is linked to another account" });
}

function unavailable(error: unknown) {
  if (!(error instanceof PhoneVerificationUnavailableError)) throw error;
  return new ServiceUnavailableException({ code: "PHONE_AUTH_UNAVAILABLE", message: "Phone verification is temporarily unavailable" });
}
