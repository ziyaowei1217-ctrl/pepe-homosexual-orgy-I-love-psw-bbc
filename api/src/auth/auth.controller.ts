import { Body, Controller, Get, Inject, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

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
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("email-code")
  requestEmailCode(@Body(emailCodeBodyPipe) dto: EmailCodeDto) {
    return this.auth.requestEmailCode(dto.email);
  }

  @Post("verify-email")
  verifyEmail(@Body(verifyEmailBodyPipe) dto: VerifyEmailDto) {
    return this.auth.verifyEmailCode(dto);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
}
