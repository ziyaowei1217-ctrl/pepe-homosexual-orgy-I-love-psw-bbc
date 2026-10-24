import { Body, Controller, Get, Inject, Optional, Post, Req, Res, UseGuards, ValidationPipe, ServiceUnavailableException } from "@nestjs/common";

import { AuthRateLimitException, AuthRateLimiter, getRequestIdentity } from "./auth-rate-limit";
import { AdminGuard } from "./admin.guard";
import { AuthGuard, AuthenticatedRequest } from "./auth.guard";
import { getAuthProvider } from "./auth-provider";
import { NeonAuthService } from "./neon-auth.service";
import { AuthService } from "./auth.service";
import { AdminStepUpCodeDto, EmailCodeDto, VerifyEmailDto, NeonTokenExchangeDto } from "./dto";

const neonTokenBodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType: NeonTokenExchangeDto });

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

const adminStepUpBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: AdminStepUpCodeDto
});

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthRateLimiter) private readonly rateLimiter: AuthRateLimiter,
    @Optional() @Inject(NeonAuthService) private readonly neon?: NeonAuthService
  ) {}

  @Post("email-code")
  async requestEmailCode(
    @Body(emailCodeBodyPipe) dto: EmailCodeDto,
    @Req() request: RequestWithIdentity,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    this.requireEmailProvider();
    await this.enforceRateLimit("send", "LOGIN", dto.email, request, response);
    return this.auth.requestEmailCode(dto.email);
  }

  @Post("verify-email")
  async verifyEmail(
    @Body(verifyEmailBodyPipe) dto: VerifyEmailDto,
    @Req() request: RequestWithIdentity,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    this.requireEmailProvider();
    await this.enforceRateLimit("verify", "LOGIN", dto.email, request, response);
    return this.auth.verifyEmailCode(dto);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post("admin-step-up/email-code")
  async requestAdminStepUp(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    this.requireEmailProvider();
    await this.enforceRateLimit("send", "ADMIN_STEP_UP", request.user.email, request, response);
    return this.auth.requestAdminStepUpCode(request.user.email);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post("admin-step-up/verify")
  async verifyAdminStepUp(
    @Req() request: AuthenticatedRequest,
    @Body(adminStepUpBodyPipe) dto: AdminStepUpCodeDto,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    this.requireEmailProvider();
    await this.enforceRateLimit("verify", "ADMIN_STEP_UP", request.user.email, request, response);
    return this.auth.verifyAdminStepUpCode({
      userId: request.user.id,
      email: request.user.email,
      code: dto.code
    });
  }

  @Post("neon/exchange")
  async exchangeNeonToken(
    @Body(neonTokenBodyPipe) dto: NeonTokenExchangeDto,
    @Req() request: RequestWithIdentity,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    if (getAuthProvider() !== "neon" || !this.neon) throw new ServiceUnavailableException({ code: "IDENTITY_PROVIDER_UNAVAILABLE", message: "External sign-in is not enabled" });
    await this.enforceRateLimit("exchange", "LOGIN", "external-sign-in@psw.invalid", request, response);
    return this.neon.exchange(dto.token);
  }

  private requireEmailProvider() {
    if (getAuthProvider() !== "email") throw new ServiceUnavailableException({ code: "AUTH_DELIVERY_UNAVAILABLE", message: "Email codes are not available with this sign-in provider" });
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  private async enforceRateLimit(
    action: "send" | "verify" | "exchange",
    purpose: "LOGIN" | "ADMIN_STEP_UP",
    email: string,
    request: RequestWithIdentity,
    response: HeaderResponse
  ) {
    const identity = getRequestIdentity(request);
    try {
      await this.rateLimiter.enforce(action, purpose, { email, ...identity });
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
