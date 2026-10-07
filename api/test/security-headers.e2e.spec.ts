import "reflect-metadata";
import { Controller, Get, INestApplication, Post, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { securityHeadersMiddleware } from "../src/http/security-headers";

const request = require("supertest") as (server: unknown) => any;

@Controller()
class SecurityTestController {
  @Get("account")
  account() { return { email: "private@example.test" }; }

  @Post("auth/verify-email")
  login() { return { accessToken: "sensitive-token" }; }

  @Get("protected")
  protected() { throw new UnauthorizedException(); }
}

describe("API security headers", () => {
  let app: INestApplication;
  beforeEach(async () => {
    const module = await Test.createTestingModule({ controllers: [SecurityTestController] }).compile();
    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().disable("x-powered-by");
    app.use(securityHeadersMiddleware);
    await app.init();
  });
  afterEach(async () => { await app.close(); });

  it.each([["get", "/account", 200], ["post", "/auth/verify-email", 201], ["get", "/protected", 401], ["get", "/missing", 404]])(
    "prevents storage and browser execution on %s %s (%s)", async (method, path, status) => {
      const response = await request(app.getHttpServer())[method as string](path).expect(status);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers).not.toHaveProperty("x-powered-by");
    }
  );
});
