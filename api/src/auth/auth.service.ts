import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  LoggerService,
  UnauthorizedException
} from "@nestjs/common";
import { Prisma, VerificationDeliveryStatus, VerificationPurpose } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";

import { EmailSender } from "../email/email-sender";
import { PrismaService } from "../prisma/prisma.service";
import {
  generateCodeSalt,
  generateEmailCode,
  hashEmailCode,
  normalizeEmail,
  verifyEmailCodeHash
} from "./code-security";
import { AUTH_OPTIONS, EMAIL_SENDER } from "./auth.tokens";
import { VerifyEmailDto } from "./dto";

export type AuthServiceOptions = {
  nodeEnv: string;
  otpHashSecret: string;
  codeTtlMs: number;
  codeMaxAttempts: number;
  codeRequestCooldownMs: number;
  localAdminEmails: string;
  responseMinimumMs: number;
  responseJitterMs: number;
  now?: () => number;
  random?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  logger?: Pick<LoggerService, "warn">;
};

type PendingCode = {
  id: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  code: string;
};

type AcceptedWithoutDelivery = Omit<PendingCode, "id" | "createdAt"> & { id: null };

@Injectable()
export class AuthService {
  private readonly nodeEnv: string;
  private readonly emailSender: EmailSender;
  private readonly otpHashSecret: string;
  private readonly codeTtlMs: number;
  private readonly codeMaxAttempts: number;
  private readonly codeRequestCooldownMs: number;
  private readonly localAdminEmails: Set<string>;
  private readonly responseMinimumMs: number;
  private readonly responseJitterMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly logger: Pick<LoggerService, "warn">;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(EMAIL_SENDER) emailSender: EmailSender,
    @Inject(AUTH_OPTIONS) options: AuthServiceOptions
  ) {
    this.nodeEnv = options.nodeEnv;
    this.emailSender = emailSender;
    this.otpHashSecret = options.otpHashSecret;
    this.codeTtlMs = options.codeTtlMs;
    this.codeMaxAttempts = options.codeMaxAttempts;
    this.codeRequestCooldownMs = options.codeRequestCooldownMs;
    this.responseMinimumMs = options.responseMinimumMs;
    this.responseJitterMs = options.responseJitterMs;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.logger = options.logger ?? new Logger(AuthService.name);
    this.localAdminEmails = new Set(
      options.localAdminEmails
        .split(",")
        .map(normalizeEmail)
        .filter(Boolean)
    );
  }

  async requestEmailCode(emailInput: string) {
    const startedAt = this.now();
    const acceptedExpiresAt = new Date(startedAt + this.codeTtlMs);
    const email = normalizeEmail(emailInput);
    if (!email) throw new BadRequestException("Email is required");

    const pending = await this.withSerializedEmail(email, async (transaction) => {
      const existingUser = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      const activeInvite = existingUser
        ? null
        : await transaction.betaInvite.findFirst({
            where: { normalizedEmail: email, revokedAt: null, claimedAt: null },
            select: { id: true }
          });

      if (!existingUser && !activeInvite) return null;

      const latestCode = await transaction.verificationCode.findFirst({
        where: { email, purpose: VerificationPurpose.LOGIN },
        orderBy: { createdAt: "desc" }
      });

      const millisecondsSinceLatestCode = latestCode
        ? Math.max(0, startedAt - latestCode.createdAt.getTime())
        : undefined;
      if (
        millisecondsSinceLatestCode !== undefined &&
        millisecondsSinceLatestCode < this.codeRequestCooldownMs
      ) {
        return {
          id: null,
          email,
          expiresAt: acceptedExpiresAt,
          code: generateEmailCode()
        } satisfies AcceptedWithoutDelivery;
      }

      const code = generateEmailCode();
      const codeSalt = generateCodeSalt();
      const expiresAt = acceptedExpiresAt;
      const createdAt = new Date(Math.max(startedAt, (latestCode?.createdAt.getTime() ?? startedAt - 1) + 1));
      const record = await transaction.verificationCode.create({
        data: {
          email,
          purpose: VerificationPurpose.LOGIN,
          codeHash: hashEmailCode({
            email,
            purpose: VerificationPurpose.LOGIN,
            salt: codeSalt,
            code,
            secret: this.otpHashSecret
          }),
          codeSalt,
          hashVersion: 2,
          attemptCount: 0,
          deliveryStatus: VerificationDeliveryStatus.PENDING,
          expiresAt,
          createdAt
        }
      });

      return { id: record.id, email, expiresAt, createdAt: record.createdAt, code } satisfies PendingCode;
    });

    if (!pending) {
      return this.acceptAfterBudget(startedAt, email, acceptedExpiresAt, generateEmailCode());
    }
    if (pending.id === null) return this.acceptAfterBudget(startedAt, email, pending.expiresAt, pending.code);

    let providerMessageId: string | undefined;
    try {
      const delivery = await this.emailSender.sendVerificationCode({
        email,
        code: pending.code,
        verificationCodeId: pending.id
      });
      providerMessageId = delivery.providerMessageId;
    } catch {
      await this.prisma.verificationCode
        .update({
          where: { id: pending.id },
          data: { deliveryStatus: VerificationDeliveryStatus.FAILED, failedAt: new Date() }
        })
        .catch(() => undefined);
      this.logger.warn("Verification email delivery failed", { verificationCodeId: pending.id });
      return this.acceptAfterBudget(startedAt, email, pending.expiresAt, pending.code);
    }

    await this.finalizeSuccessfulDelivery(pending, providerMessageId);

    return this.acceptAfterBudget(startedAt, email, pending.expiresAt, pending.code);
  }

  consumeLoginCodesForInviteRevocation(
    transaction: Prisma.TransactionClient,
    emailInput: string,
    consumedAt = new Date()
  ) {
    return transaction.verificationCode.updateMany({
      where: {
        email: normalizeEmail(emailInput),
        purpose: VerificationPurpose.LOGIN,
        consumedAt: null
      },
      data: { consumedAt }
    });
  }

  async verifyEmailCode(dto: VerifyEmailDto) {
    const email = normalizeEmail(dto.email);
    const code = dto.code.trim();
    if (!/^\d{6}$/.test(code)) throw new BadRequestException("Verification code must be 6 digits");

    const result = await this.withSerializedEmail(email, async (transaction) => {
      const record = await transaction.verificationCode.findFirst({
        where: {
          email,
          purpose: VerificationPurpose.LOGIN,
          deliveryStatus: VerificationDeliveryStatus.SENT,
          consumedAt: null,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: "desc" }
      });

      if (
        !record ||
        record.attemptCount >= this.codeMaxAttempts ||
        record.hashVersion !== 2 ||
        !record.codeSalt
      ) {
        return { status: "invalid" as const };
      }

      if (
        !verifyEmailCodeHash({
          email,
          purpose: VerificationPurpose.LOGIN,
          salt: record.codeSalt,
          code,
          secret: this.otpHashSecret,
          codeHash: record.codeHash
        })
      ) {
        await transaction.verificationCode.update({
          where: { id: record.id },
          data: { attemptCount: { increment: 1 } }
        });
        return { status: "invalid" as const };
      }

      const isLocalAdmin = this.localAdminEmails.has(email);
      const existingUser = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      const isNewUser = existingUser === null;
      if (isNewUser) {
        const claimedInvite = await transaction.betaInvite.updateMany({
          where: { normalizedEmail: email, claimedAt: null, revokedAt: null },
          data: { claimedAt: new Date() }
        });
        if (claimedInvite.count !== 1) return { status: "invalid" as const };
      }
      const user = await transaction.user.upsert({
        where: { email },
        update: isLocalAdmin ? { role: "ADMIN" } : {},
        create: { email, role: isLocalAdmin ? "ADMIN" : "USER" }
      });
      await transaction.profile.upsert({ where: { email }, update: {}, create: { email } });
      await transaction.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() }
      });

      return { status: "verified" as const, user, isNewUser };
    });

    if (result.status === "invalid") throw new UnauthorizedException("Invalid or expired verification code");

    return {
      accessToken: await this.jwt.signAsync({
        sub: result.user.id,
        email: result.user.email,
        role: result.user.role
      }),
      user: result.user,
      isNewUser: result.isNewUser
    };
  }

  private acceptedResponse(email: string, expiresAt: Date, code: string) {
    const response: { email: string; expiresAt: Date; devCode?: string } = { email, expiresAt };
    if (this.nodeEnv !== "production") response.devCode = code;
    return response;
  }

  private async acceptAfterBudget(startedAt: number, email: string, expiresAt: Date, code: string) {
    const jitter = Math.floor(this.random() * (this.responseJitterMs + 1));
    const remainingMs = this.responseMinimumMs + jitter - (this.now() - startedAt);
    if (remainingMs > 0) await this.delay(remainingMs);
    return this.acceptedResponse(email, expiresAt, code);
  }

  private async finalizeSuccessfulDelivery(pending: PendingCode, providerMessageId?: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.withSerializedEmail(pending.email, async (transaction) => {
          const sentAt = new Date();
          const newerSentCode = await transaction.verificationCode.findFirst({
            where: {
              email: pending.email,
              purpose: VerificationPurpose.LOGIN,
              deliveryStatus: VerificationDeliveryStatus.SENT,
              createdAt: { gt: pending.createdAt }
            },
            select: { id: true }
          });
          await transaction.verificationCode.update({
            where: { id: pending.id },
            data: {
              deliveryStatus: VerificationDeliveryStatus.SENT,
              sentAt,
              providerMessageId: providerMessageId ?? null,
              ...(newerSentCode ? { consumedAt: sentAt } : {})
            }
          });
          if (newerSentCode) return;
          await transaction.verificationCode.updateMany({
            where: {
              email: pending.email,
              purpose: VerificationPurpose.LOGIN,
              deliveryStatus: VerificationDeliveryStatus.SENT,
              consumedAt: null,
              createdAt: { lt: pending.createdAt },
              id: { not: pending.id }
            },
            data: { consumedAt: sentAt }
          });
        });
        return;
      } catch {
        if (attempt === 1) {
          this.logger.warn("Verification email finalization failed", {
            verificationCodeId: pending.id
          });
        }
      }
    }
  }

  private withSerializedEmail<T>(
    email: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}::text, 0))`;
      return operation(transaction);
    });
  }
}
