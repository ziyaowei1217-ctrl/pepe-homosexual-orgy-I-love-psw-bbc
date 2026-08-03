import { Module } from "@nestjs/common";

import { getAuthSecurityConfig } from "../config/env";
import { createEmailSender } from "../email/email-sender";
import { AuthRateLimiter, RateLimitStore } from "./auth-rate-limit";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService, AuthServiceOptions } from "./auth.service";
import { OptionalAuthGuard } from "./optional-auth.guard";
import { createRateLimitStore } from "./valkey-rate-limit-store";
import { AUTH_OPTIONS, AUTH_RATE_LIMIT_STORE, AUTH_SECURITY_CONFIG, EMAIL_SENDER } from "./auth.tokens";
import { VerificationCodeCleanupService } from "./verification-code-cleanup.service";

export { AUTH_OPTIONS, AUTH_RATE_LIMIT_STORE, AUTH_SECURITY_CONFIG, EMAIL_SENDER } from "./auth.tokens";

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_SECURITY_CONFIG,
      useFactory: () => getAuthSecurityConfig()
    },
    {
      provide: AUTH_RATE_LIMIT_STORE,
      useFactory: () => createRateLimitStore()
    },
    {
      provide: EMAIL_SENDER,
      useFactory: () => createEmailSender()
    },
    {
      provide: AUTH_OPTIONS,
      inject: [AUTH_SECURITY_CONFIG],
      useFactory: (securityConfig: ReturnType<typeof getAuthSecurityConfig>): AuthServiceOptions => {
        const nodeEnv = process.env.NODE_ENV ?? "development";
        return {
          nodeEnv,
          otpHashSecret: securityConfig.otpHashSecret,
          codeTtlMs: securityConfig.codeTtlMs,
          codeMaxAttempts: securityConfig.codeMaxAttempts,
          codeRequestCooldownMs: securityConfig.codeCooldownMs,
          localAdminEmails: process.env.LOCAL_ADMIN_EMAILS ?? "",
          responseMinimumMs: nodeEnv === "test" ? 0 : 350,
          responseJitterMs: nodeEnv === "test" ? 0 : 100
        };
      }
    },
    {
      provide: AuthRateLimiter,
      inject: [AUTH_RATE_LIMIT_STORE, AUTH_SECURITY_CONFIG],
      useFactory: (store: RateLimitStore, securityConfig: ReturnType<typeof getAuthSecurityConfig>) =>
        new AuthRateLimiter({
          store,
          identifierHashSecret: securityConfig.securityIdentifierHashSecret,
          nodeEnv: process.env.NODE_ENV ?? "development"
        })
    },
    AuthService,
    VerificationCodeCleanupService,
    AuthGuard,
    OptionalAuthGuard
  ],
  exports: [AuthGuard, OptionalAuthGuard, AuthService, AUTH_OPTIONS, EMAIL_SENDER]
})
export class AuthModule {}
