import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { getMfaEncryptionKey } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./authenticated-user.service";
import { signSessionToken } from "./session-token";

export const MFA_WINDOW_MS = 10 * 60 * 1000;
export type FactorProof = { code?: string; recoveryCode?: string };
function bad(code = "MFA_INVALID_CODE") { return new BadRequestException({ code, message: "Independent verification failed" }); }
function recoveryHash(userId: string, code: string) { return createHash("sha256").update(`${userId}:${code}`).digest("hex"); }
function encrypt(userId: string, secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", getMfaEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(`sublet:mfa:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
function decrypt(userId: string, value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted MFA secret");
  const cipher = createDecipheriv("aes-256-gcm", getMfaEncryptionKey(), Buffer.from(iv, "base64"));
  cipher.setAAD(Buffer.from(`sublet:mfa:v1:${userId}`)); cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, "base64")), cipher.final()]).toString("utf8");
}
export function mfaVerifiedUntil(value: number | undefined, now = Date.now()) {
  return Number.isSafeInteger(value) && value! <= now && now - value! < MFA_WINDOW_MS ? new Date(value! + MFA_WINDOW_MS).toISOString() : null;
}

@Injectable()
export class MfaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(JwtService) private readonly jwt: JwtService) {}

  async status(user: AuthenticatedUser) {
    const factor = await this.prisma.userMfa.findUnique({ where: { userId: user.id } });
    const enabled = Boolean(factor?.enabledAt);
    return { enabled, recoveryCodesRemaining: enabled ? await this.prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } }) : 0,
      verifiedUntil: enabled ? mfaVerifiedUntil(user.mfaVerifiedAt) : null };
  }

  private async lock(transaction: Prisma.TransactionClient, user: AuthenticatedUser, recent = false) {
    // Every factor mutation takes the same user lock, then the session lock. Logout
    // takes the session row lock through UPDATE, so it cannot revive a session.
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
    await transaction.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id"=${user.sessionId}::uuid FOR UPDATE`;
    const session = await transaction.authSession.findUnique({ where: { id: user.sessionId } });
    const now = Date.now();
    if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt.getTime() <= now) throw new UnauthorizedException();
    if (recent && (now < session.createdAt.getTime() || now - session.createdAt.getTime() >= MFA_WINDOW_MS)) {
      throw new ForbiddenException({ code: "AUTH_RECENT_LOGIN_REQUIRED", message: "Sign in again before changing verification settings" });
    }
    return session;
  }

  async enrollment(user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user, true);
      const factor = await tx.userMfa.findUnique({ where: { userId: user.id } });
      if (factor?.enabledAt) throw bad("MFA_ALREADY_ENABLED");
      if (factor?.lockedUntil && factor.lockedUntil.getTime() > Date.now()) throw new HttpException({ code: "MFA_RATE_LIMITED" }, 429);
      const secret = generateSecret();
      const data = { pendingEncryptedSecret: encrypt(user.id, secret), pendingSessionId: user.sessionId, pendingExpiresAt: new Date(Date.now() + MFA_WINDOW_MS) };
      await tx.userMfa.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
      return { secret, otpauthUri: generateURI({ issuer: "Sublet", label: user.email, secret }) };
    });
  }

  async prove(user: AuthenticatedUser, proof: FactorProof, action: "confirm" | "verify" | "disable") {
    if (!proof || (Boolean(proof.code) === Boolean(proof.recoveryCode)) ||
      (proof.code !== undefined && !/^\d{6}$/.test(proof.code)) ||
      (proof.recoveryCode !== undefined && !/^[a-f0-9]{32}$/.test(proof.recoveryCode)) ||
      (action === "confirm" && !proof.code)) throw bad();
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lock(tx, user, action !== "verify");
      const factor = await tx.userMfa.findUnique({ where: { userId: user.id } });
      if (!factor) return { error: "MFA_ENROLLMENT_REQUIRED" } as const;
      const now = new Date();
      if (factor.lockedUntil && factor.lockedUntil > now) return { limited: true } as const;
      const confirming = action === "confirm";
      if (confirming ? (factor.enabledAt || factor.pendingSessionId !== session.id || !factor.pendingExpiresAt || factor.pendingExpiresAt <= now) : !factor.enabledAt) return { error: "MFA_ENROLLMENT_REQUIRED" } as const;
      let step: number | undefined;
      let valid = false;
      if (proof.code) {
        const encrypted = confirming ? factor.pendingEncryptedSecret : factor.encryptedSecret;
        if (encrypted) {
          const outcome = await verify({ secret: decrypt(user.id, encrypted), token: proof.code, epochTolerance: 0, ...(factor.lastUsedStep == null ? {} : { afterTimeStep: factor.lastUsedStep }) });
          if (outcome.valid && "timeStep" in outcome) { valid = true; step = outcome.timeStep; }
        }
      } else {
        const consumed = await tx.mfaRecoveryCode.updateMany({ where: { userId: user.id, codeHash: recoveryHash(user.id, proof.recoveryCode!), usedAt: null }, data: { usedAt: now } });
        valid = consumed.count === 1;
      }
      if (!valid) {
        const failures = factor.failureCount + 1;
        await tx.userMfa.update({ where: { userId: user.id }, data: { failureCount: failures, lockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null } });
        // Return failures so the transaction commits the brute-force counter.
        return { error: "MFA_INVALID_CODE" } as const;
      }
      if (action !== "verify") {
        // Binding/removing an authentication factor terminates other devices,
        // while the device that proved the factor keeps its current session.
        await tx.authSession.updateMany({
          where: { userId: user.id, id: { not: session.id }, revokedAt: null },
          data: { revokedAt: now, mfaVerifiedAt: null }
        });
      }
      if (action === "disable") {
        await tx.authSession.updateMany({ where: { userId: user.id }, data: { mfaVerifiedAt: null } });
        await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
        await tx.userMfa.delete({ where: { userId: user.id } });
        return { disabled: true } as const;
      }
      const recoveryCodes = confirming ? Array.from({ length: 10 }, () => randomBytes(16).toString("hex")) : undefined;
      if (recoveryCodes) await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map(code => ({ userId: user.id, codeHash: recoveryHash(user.id, code) })) });
      await tx.userMfa.update({ where: { userId: user.id }, data: {
        failureCount: 0, lockedUntil: null, ...(step === undefined ? {} : { lastUsedStep: step }),
        ...(confirming ? { encryptedSecret: factor.pendingEncryptedSecret, enabledAt: now, pendingEncryptedSecret: null, pendingSessionId: null, pendingExpiresAt: null } : {})
      } });
      // Millisecond claim is matched exactly to this durable session value. Older
      // tokens with the same sid do not inherit this verification.
      const verifiedAt = Math.max(now.getTime(), (session.mfaVerifiedAt?.getTime() ?? 0) + 1);
      await tx.authSession.update({ where: { id: session.id }, data: { mfaVerifiedAt: new Date(verifiedAt) } });
      return { session, verifiedAt, recoveryCodes } as const;
    }, { timeout: 10000 });
    if ("limited" in result) throw new HttpException({ code: "MFA_RATE_LIMITED", message: "Too many attempts; try again later" }, 429);
    if ("error" in result) throw bad(result.error);
    if ("disabled" in result) return { disabled: true };
    return { accessToken: await signSessionToken(this.jwt, result.session, { email: user.email, role: user.role, mfaVerifiedAt: result.verifiedAt,
      ...(user.role === "ADMIN" ? { adminReauthenticatedAt: Math.floor(result.verifiedAt / 1000) } : {}) }),
      verifiedUntil: new Date(result.verifiedAt + MFA_WINDOW_MS).toISOString(), ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) };
  }
}
