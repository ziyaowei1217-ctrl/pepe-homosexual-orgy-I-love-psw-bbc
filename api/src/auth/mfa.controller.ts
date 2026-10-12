import { Body, Controller, Get, Inject, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";
import { IsOptional, IsString, Matches } from "class-validator";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";
import { MfaService } from "./mfa.service";
class FactorDto {
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{32}$/) recoveryCode?: string;
}
const pipe = new ValidationPipe({ expectedType: FactorDto, whitelist: true, forbidNonWhitelisted: true, transform: true });
@UseGuards(AuthGuard)
@Controller("auth/mfa")
export class MfaController {
 constructor(@Inject(MfaService) private readonly mfa: MfaService) {}
 @Get() status(@Req() req: AuthenticatedRequest) { return this.mfa.status(req.user); }
 @Post("enrollment") enrollment(@Req() req: AuthenticatedRequest) { return this.mfa.enrollment(req.user); }
 @Post("enrollment/confirm") confirm(@Req() req: AuthenticatedRequest, @Body(pipe) proof: FactorDto) { return this.mfa.prove(req.user, proof, "confirm"); }
 @Post("verify") verify(@Req() req: AuthenticatedRequest, @Body(pipe) proof: FactorDto) { return this.mfa.prove(req.user, proof, "verify"); }
 @Post("disable") disable(@Req() req: AuthenticatedRequest, @Body(pipe) proof: FactorDto) { return this.mfa.prove(req.user, proof, "disable"); }
}
