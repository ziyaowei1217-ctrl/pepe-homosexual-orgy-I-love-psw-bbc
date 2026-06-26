import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";
import { EmailCodeDto, VerifyEmailDto } from "./dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("email-code")
  requestEmailCode(@Body() dto: EmailCodeDto) {
    return this.auth.requestEmailCode(dto.email);
  }

  @Post("verify-email")
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmailCode(dto);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
}
