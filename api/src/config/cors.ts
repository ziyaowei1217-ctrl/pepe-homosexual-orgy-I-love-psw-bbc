import { INestApplication } from "@nestjs/common";

import { legacyListingsOptionsMiddleware, remainingOptionsMiddleware } from "../http/legacy-listings-retirement";

const defaultDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001"
];

export function getCorsOrigins(webOrigin?: string) {
  if (!webOrigin) return defaultDevOrigins;

  return webOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function configureCors(
  app: Pick<INestApplication, "enableCors" | "use">,
  origins: string[]
) {
  app.enableCors({
    origin: origins,
    credentials: true,
    preflightContinue: true
  });
  app.use(legacyListingsOptionsMiddleware);
  app.use(remainingOptionsMiddleware);
}
