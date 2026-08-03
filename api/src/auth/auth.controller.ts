import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthRateLimitException, AuthRateLimiter, getRequestIdentity } from "./auth-rate-limit";
import { AuthGuard, AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";
import { EmailCodeDto, VerifyEmailDto } from "./dto";

const emailCodeBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: EmailCodeDto
});

const verifyEmailBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: VerifyEmailDto
});

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthRateLimiter) private readonly rateLimiter: AuthRateLimiter
  ) {}

  @Post("email-code")
  async requestEmailCode(
    @Body(emailCodeBodyPipe) dto: EmailCodeDto,
    @Req() request: RequestWithIdentity,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    await this.enforceRateLimit("send", dto.email, request, response);
    return this.auth.requestEmailCode(dto.email);
  }

  @Post("verify-email")
  async verifyEmail(
    @Body(verifyEmailBodyPipe) dto: VerifyEmailDto,
    @Req() request: RequestWithIdentity,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    await this.enforceRateLimit("verify", dto.email, request, response);
    return this.auth.verifyEmailCode(dto);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  private async enforceRateLimit(
    action: "send" | "verify",
    email: string,
    request: RequestWithIdentity,
    response: HeaderResponse
  ) {
    const identity = getRequestIdentity(request);
    try {
      await this.rateLimiter.enforce(action, { email, ...identity });
    } catch (error) {
      if (error instanceof AuthRateLimitException) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
      }
      throw error;
    }
  }
}

type RequestWithIdentity = Parameters<typeof getRequestIdentity>[0];
type HeaderResponse = { setHeader(name: string, value: string): unknown };
