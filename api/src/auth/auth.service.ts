import { BadRequestException, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { createEmailSender, EmailSender } from "../email/email-sender";
import { PrismaService } from "../prisma/prisma.service";
import { generateEmailCode, hashEmailCode, normalizeEmail, verifyEmailCodeHash } from "./code-security";
import { VerifyEmailDto } from "./dto";

type AuthServiceOptions = {
  nodeEnv?: string;
  emailSender?: EmailSender;
  codeRequestCooldownMs?: number;
};

const maxVerificationAttempts = 5;
const defaultCodeRequestCooldownMs = 60_000;

@Injectable()
export class AuthService {
  private readonly nodeEnv: string;
  private readonly emailSender: EmailSender;
  private readonly codeRequestCooldownMs: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Optional()
    options: AuthServiceOptions = {}
  ) {
    this.nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
    this.emailSender = options.emailSender ?? createEmailSender({ nodeEnv: this.nodeEnv });
    this.codeRequestCooldownMs = options.codeRequestCooldownMs ?? defaultCodeRequestCooldownMs;
  }

  async requestEmailCode(emailInput: string) {
    const email = normalizeEmail(emailInput);
    if (!email) throw new BadRequestException("Email is required");

    const latestCode = await this.prisma.verificationCode.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" }
    });

    if (latestCode && Date.now() - latestCode.createdAt.getTime() < this.codeRequestCooldownMs) {
      throw new BadRequestException("Please wait before requesting another code");
    }

    const code = generateEmailCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const record = await this.prisma.verificationCode.create({
      data: {
        email,
        codeHash: hashEmailCode(email, code),
        expiresAt,
        attemptCount: 0
      }
    });

    try {
      await this.emailSender.sendVerificationCode({ email, code });
    } catch (error) {
      await this.prisma.verificationCode.delete({ where: { id: record.id } });
      throw error;
    }

    await this.prisma.verificationCode.updateMany({
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
  }

  async verifyEmailCode(dto: VerifyEmailDto) {
    const email = normalizeEmail(dto.email);
    const code = dto.code.trim();
    if (!/^\d{6}$/.test(code)) throw new BadRequestException("Verification code must be 6 digits");

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        email,
        consumedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!record) throw new UnauthorizedException("Invalid or expired verification code");
    if (record.attemptCount >= maxVerificationAttempts) {
      throw new UnauthorizedException("Invalid or expired verification code");
    }

    if (!verifyEmailCodeHash(email, code, record.codeHash)) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attemptCount: { increment: 1 } }
      });
      throw new UnauthorizedException("Invalid or expired verification code");
    }

    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email }
    });

    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() }
    });

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role }),
      user
    };
  }
}
