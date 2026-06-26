import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";
import { VerifyEmailDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async requestEmailCode(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    if (!email) throw new BadRequestException("Email is required");

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.verificationCode.create({
      data: { email, code, expiresAt }
    });

    console.log(`[dev email code] ${email}: ${code}`);

    return {
      email,
      expiresAt,
      devCode: code
    };
  }

  async verifyEmailCode(dto: VerifyEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const record = await this.prisma.verificationCode.findFirst({
      where: {
        email,
        code: dto.code,
        consumedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!record) throw new UnauthorizedException("Invalid or expired verification code");

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
