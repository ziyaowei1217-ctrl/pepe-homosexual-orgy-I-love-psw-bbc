import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { getAuthSecurityConfig } from "./config/env";
import { configureCors, getCorsOrigins } from "./config/cors";
import { MessagingInfrastructureHealth } from "./health/messaging-infrastructure-health";
import { requestIdMiddleware } from "./http/request-id";
import { createRoommateSocketAdapter } from "./roommate-conversations/socket-adapter";

type SecurityHeaderResponse = {
  setHeader(name: string, value: string): unknown;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const messagingInfrastructure = app.get(MessagingInfrastructureHealth);
  const socketAdapter = await createRoommateSocketAdapter(app, {
    valkeyUrl: config.get<string>("VALKEY_URL"),
    health: messagingInfrastructure
  });
  if (socketAdapter) app.useWebSocketAdapter(socketAdapter);
  app.enableShutdownHooks();
  const webOrigins = getCorsOrigins(config.get<string>("WEB_ORIGIN"));
  const securityConfig = getAuthSecurityConfig();
  const express = app.getHttpAdapter().getInstance() as { set(name: string, value: number): void };
  express.set("trust proxy", securityConfig.trustedProxyHops);

  app.use(requestIdMiddleware);
  app.use((_request: unknown, response: SecurityHeaderResponse, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  configureCors(app, webOrigins);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = config.get<number>("PORT") ?? 4000;
  await app.listen(port);
  console.log(`Sublet Pipeline API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
