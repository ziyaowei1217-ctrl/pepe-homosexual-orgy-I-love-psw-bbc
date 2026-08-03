import { Module } from "@nestjs/common";

import { getAuthSecurityConfig, type AuthSecurityConfig } from "../config/env";
import { createEmailSender, EMAIL_PROVIDER_TOTAL_TIMEOUT_MS } from "../email/email-sender";
import { AuthRateLimiter, RateLimitStore } from "./auth-rate-limit";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService, AuthServiceOptions } from "./auth.service";
import { OptionalAuthGuard } from "./optional-auth.guard";
import { createRateLimitStore } from "./valkey-rate-limit-store";
import { AUTH_OPTIONS, AUTH_RATE_LIMIT_STORE, AUTH_SECURITY_CONFIG, EMAIL_SENDER } from "./auth.tokens";
import { VerificationCodeCleanupService } from "./verification-code-cleanup.service";

export { AUTH_OPTIONS, AUTH_RATE_LIMIT_STORE, AUTH_SECURITY_CONFIG, EMAIL_SENDER } from "./auth.tokens";

export function createAuthServiceOptions(
  securityConfig: AuthSecurityConfig,
  nodeEnv = process.env.NODE_ENV ?? "development",
  localAdminEmails = process.env.LOCAL_ADMIN_EMAILS ?? ""
): AuthServiceOptions {
  const normalizedLocalAdminEmails = localAdminEmails.trim();
  if (nodeEnv === "production" && normalizedLocalAdminEmails) {
    throw new Error("LOCAL_ADMIN_EMAILS is not allowed in production");
  }

  const productionResponseJitterMs = 250;
  const timing =
    nodeEnv === "production"
      ? {
          responseMinimumMs: EMAIL_PROVIDER_TOTAL_TIMEOUT_MS + productionResponseJitterMs,
          responseJitterMs: productionResponseJitterMs
        }
      : nodeEnv === "test"
        ? { responseMinimumMs: 0, responseJitterMs: 0 }
        : { responseMinimumMs: 350, responseJitterMs: 100 };

  return {
    nodeEnv,
    otpHashSecret: securityConfig.otpHashSecret,
    codeTtlMs: securityConfig.codeTtlMs,
    codeMaxAttempts: securityConfig.codeMaxAttempts,
    codeRequestCooldownMs: securityConfig.codeCooldownMs,
    localAdminEmails: normalizedLocalAdminEmails,
    ...timing
  };
}

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
      useFactory: (securityConfig: ReturnType<typeof getAuthSecurityConfig>): AuthServiceOptions =>
        createAuthServiceOptions(securityConfig)
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
    AdminGuard,
    OptionalAuthGuard
  ],
  exports: [AuthGuard, OptionalAuthGuard, AuthService, AUTH_OPTIONS, EMAIL_SENDER]
})
export class AuthModule {}
