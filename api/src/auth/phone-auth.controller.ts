import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AdminGuard } from "./admin.guard";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";
import { AuthRateLimitException, AuthRateLimiter, getRequestIdentity, type AuthRateLimitPurpose } from "./auth-rate-limit";
import { AdminStepUpCodeDto, PhoneCodeDto, PhoneNumberDto } from "./dto";
import { PHONE_LIMIT_EMAIL, PhoneAuthService } from "./phone-auth.service";

const pipe = (expectedType: new () => object) => new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType });
const phoneNumberPipe = pipe(PhoneNumberDto);
const phoneCodePipe = pipe(PhoneCodeDto);
const stepUpCodePipe = pipe(AdminStepUpCodeDto);

type RequestWithIdentity = Parameters<typeof getRequestIdentity>[0];
type HeaderResponse = { setHeader(name: string, value: string): unknown };

@Controller("auth")
export class PhoneAuthController {
  constructor(
    @Inject(PhoneAuthService) private readonly phone: PhoneAuthService,
    @Inject(AuthRateLimiter) private readonly rateLimiter: AuthRateLimiter,
    @Inject(JwtService) private readonly jwt: JwtService
  ) {}

  @Get("phone/availability")
  availability() {
    return this.phone.availability();
  }

  @Post("phone/sign-in/code")
  @HttpCode(200)
  async requestSignInCode(@Body(phoneNumberPipe) dto: PhoneNumberDto, @Req() request: RequestWithIdentity, @Res({ passthrough: true }) response: HeaderResponse) {
    const phoneNumber = this.phone.normalize(dto.phoneNumber);
    await this.limit("send", "PHONE_LOGIN", phoneNumber, request, response);
    return this.phone.requestSignInCode(phoneNumber);
  }

  @Post("phone/sign-in/verify")
  @HttpCode(200)
  async verifySignInCode(@Body(phoneCodePipe) dto: PhoneCodeDto, @Req() request: RequestWithIdentity, @Res({ passthrough: true }) response: HeaderResponse) {
    const phoneNumber = this.phone.normalize(dto.phoneNumber);
    await this.limit("verify", "PHONE_LOGIN", phoneNumber, request, response);
    return this.phone.verifySignInCode(phoneNumber, dto.code);
  }

  @UseGuards(AuthGuard)
  @Get("phone")
  status(@Req() request: AuthenticatedRequest) {
    return this.phone.status(request.user.id);
  }

  @UseGuards(AuthGuard)
  @Post("phone/link/code")
  @HttpCode(200)
  async requestLinkCode(@Body(phoneNumberPipe) dto: PhoneNumberDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HeaderResponse) {
    const phoneNumber = this.phone.normalize(dto.phoneNumber);
    await this.limit("send", "PHONE_LINK", phoneNumber, request, response, request.user.id);
    return this.phone.requestLinkCode(request.user, phoneNumber, this.sessionIssuedAt(request));
  }

  @UseGuards(AuthGuard)
  @Post("phone/link/verify")
  @HttpCode(200)
  async verifyLinkCode(@Body(phoneCodePipe) dto: PhoneCodeDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HeaderResponse) {
    const phoneNumber = this.phone.normalize(dto.phoneNumber);
    await this.limit("verify", "PHONE_LINK", phoneNumber, request, response, request.user.id);
    return this.phone.verifyLinkCode(request.user, phoneNumber, dto.code, this.sessionIssuedAt(request));
  }

  @UseGuards(AuthGuard)
  @Post("phone/unlink")
  @HttpCode(200)
  unlink(@Req() request: AuthenticatedRequest) {
    return this.phone.unlink(request.user, this.sessionIssuedAt(request));
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post("admin-step-up/phone-code")
  @HttpCode(200)
  async requestAdminStepUp(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HeaderResponse) {
    this.phone.assertEnabled();
    // The limit is keyed on the administrator, whose number the service looks up.
    await this.limit("send", "PHONE_STEP_UP", `admin:${request.user.id}`, request, response, request.user.id);
    return this.phone.requestAdminStepUpCode(request.user.id);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post("admin-step-up/phone-verify")
  @HttpCode(200)
  async verifyAdminStepUp(@Body(stepUpCodePipe) dto: AdminStepUpCodeDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HeaderResponse) {
    this.phone.assertEnabled();
    await this.limit("verify", "PHONE_STEP_UP", `admin:${request.user.id}`, request, response, request.user.id);
    return this.phone.verifyAdminStepUpCode(request.user, dto.code);
  }

  // AuthGuard has already verified this bearer token; only its issue time is read.
  private sessionIssuedAt(request: AuthenticatedRequest) {
    const header = request.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const payload = this.jwt.decode<{ iat?: unknown } | null>(token);
    return payload && Number.isSafeInteger(payload.iat) ? (payload.iat as number) * 1000 : undefined;
  }

  private async limit(action: "send" | "verify", purpose: AuthRateLimitPurpose, subject: string, request: RequestWithIdentity, response: HeaderResponse, actorId?: string) {
    try {
      await this.rateLimiter.enforce(action, purpose, { email: PHONE_LIMIT_EMAIL, subject, actorId, ...getRequestIdentity(request) });
    } catch (error) {
      if (error instanceof AuthRateLimitException) response.setHeader("Retry-After", String(error.retryAfterSeconds));
      throw error;
    }
  }
}

