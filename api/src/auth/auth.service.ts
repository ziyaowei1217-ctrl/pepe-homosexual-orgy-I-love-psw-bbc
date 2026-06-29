import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";
import { generateEmailCode, hashEmailCode, normalizeEmail, verifyEmailCodeHash } from "./code-security";
import { VerifyEmailDto } from "./dto";

type AuthServiceOptions = {
  nodeEnv?: string;
};

const maxVerificationAttempts = 5;

@Injectable()
export class AuthService {
  private readonly nodeEnv: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    options: AuthServiceOptions = {}
  ) {
    this.nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  }

  async requestEmailCode(emailInput: string) {
    const email = normalizeEmail(emailInput);
    if (!email) throw new BadRequestException("Email is required");

    const code = generateEmailCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.verificationCode.create({
      data: {
        email,
        codeHash: hashEmailCode(email, code),
        expiresAt,
        attemptCount: 0
      }
    });

    if (this.nodeEnv !== "production") {
      console.log(`[dev email code] ${email}: ${code}`);
    }

    const response: { email: string; expiresAt: Date; devCode?: string } = {
      email,
      expiresAt
    };

    if (this.nodeEnv !== "production") response.devCode = code;

    return response;
  }

  async verifyEmailCode(dto: VerifyEmailDto) {
    const email = normalizeEmail(dto.email);
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

    if (!verifyEmailCodeHash(email, dto.code, record.codeHash)) {
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
