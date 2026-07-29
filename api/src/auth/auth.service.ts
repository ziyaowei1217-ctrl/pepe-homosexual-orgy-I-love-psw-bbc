import { BadRequestException, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";

import { createEmailSender, EmailSender } from "../email/email-sender";
import { PrismaService } from "../prisma/prisma.service";
import { generateEmailCode, hashEmailCode, normalizeEmail, verifyEmailCodeHash } from "./code-security";
import { VerifyEmailDto } from "./dto";

type AuthServiceOptions = {
  nodeEnv?: string;
  emailSender?: EmailSender;
  codeRequestCooldownMs?: number;
  localAdminEmails?: string;
};

const maxVerificationAttempts = 5;
const defaultCodeRequestCooldownMs = 60_000;

@Injectable()
export class AuthService {
  private readonly nodeEnv: string;
  private readonly emailSender: EmailSender;
  private readonly codeRequestCooldownMs: number;
  private readonly localAdminEmails: Set<string>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Optional()
    options: AuthServiceOptions = {}
  ) {
    this.nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
    this.emailSender = options.emailSender ?? createEmailSender({ nodeEnv: this.nodeEnv });
    this.codeRequestCooldownMs = options.codeRequestCooldownMs ?? defaultCodeRequestCooldownMs;
    this.localAdminEmails = new Set(
      (options.localAdminEmails ?? process.env.LOCAL_ADMIN_EMAILS ?? "")
        .split(",")
        .map(normalizeEmail)
        .filter(Boolean)
    );
  }

  async requestEmailCode(emailInput: string) {
    const email = normalizeEmail(emailInput);
    if (!email) throw new BadRequestException("Email is required");

    return this.withSerializedEmail(email, async (transaction) => {
      const latestCode = await transaction.verificationCode.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" }
      });

      if (latestCode && Date.now() - latestCode.createdAt.getTime() < this.codeRequestCooldownMs) {
        throw new BadRequestException("Please wait before requesting another code");
      }

      const code = generateEmailCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const record = await transaction.verificationCode.create({
        data: {
          email,
          codeHash: hashEmailCode(email, code),
          expiresAt,
          attemptCount: 0
        }
      });

      await this.emailSender.sendVerificationCode({ email, code });

      await transaction.verificationCode.updateMany({
        where: {
          email,
          consumedAt: null,
          id: { not: record.id }
        },
        data: {
          consumedAt: new Date()
        }
      });

      const response: { email: string; expiresAt: Date; devCode?: string } = {
        email,
        expiresAt
      };

      if (this.nodeEnv !== "production") response.devCode = code;

      return response;
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
          consumedAt: null,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: "desc" }
      });

      if (!record || record.attemptCount >= maxVerificationAttempts) {
        return { status: "invalid" as const };
      }

      if (!verifyEmailCodeHash(email, code, record.codeHash)) {
        await transaction.verificationCode.update({
          where: { id: record.id },
          data: { attemptCount: { increment: 1 } }
        });
        return { status: "invalid" as const };
      }

      const isLocalAdmin = this.localAdminEmails.has(email);
      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: { id: true }
      });
      const isNewUser = existingUser === null;
      const user = await transaction.user.upsert({
        where: { email },
        update: isLocalAdmin ? { role: "ADMIN" } : {},
        create: {
          email,
          role: isLocalAdmin ? "ADMIN" : "USER"
        }
      });
      await transaction.profile.upsert({
        where: { email },
        update: {},
        create: { email }
      });

      await transaction.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() }
      });

      return { status: "verified" as const, user, isNewUser };
    });

    if (result.status === "invalid") {
      throw new UnauthorizedException("Invalid or expired verification code");
    }

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

  private withSerializedEmail<T>(
    email: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${email}::text, 0))
      `;
      return operation(transaction);
    });
  }
}
