import "reflect-metadata";
import { type INestApplication, ValidationPipe, ServiceUnavailableException } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthGuard } from "../src/auth/auth.guard";
import { AdminGuard } from "../src/auth/admin.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { AuthService } from "../src/auth/auth.service";
import { AuthModule } from "../src/auth/auth.module";
import { AuthRateLimiter, InMemoryRateLimitStore } from "../src/auth/auth-rate-limit";
import { AUTH_RATE_LIMIT_STORE, EMAIL_SENDER } from "../src/auth/auth.tokens";
import { NeonAuthService } from "../src/auth/neon-auth.service";
import { NeonTokenVerifier } from "../src/auth/neon-token-verifier";
import { getNeonAuthConfig } from "../src/auth/auth-provider";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { identityMemory } from "./support/neon-identity-memory";
const request = require("supertest") as (server: unknown) => any;

const env = { AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: "https://ep-http-test.neonauth.us-east-2.aws.neon.tech/neondb/auth", PUBLIC_BETA_SIGNUP: "true" };
const config = getNeonAuthConfig(env)!;

describe("Neon identity exchange HTTP boundary", () => {
  let app: INestApplication;
  let pair: Awaited<ReturnType<typeof generateKeyPair>>;
  let memory: ReturnType<typeof identityMemory>;
  let emails: { requestEmailCode: ReturnType<typeof vi.fn>; verifyEmailCode: ReturnType<typeof vi.fn>; requestAdminStepUpCode: ReturnType<typeof vi.fn>; verifyAdminStepUpCode: ReturnType<typeof vi.fn> };
  let limiter: AuthRateLimiter;
  beforeEach(async () => {
    vi.stubEnv("AUTH_PROVIDER", "neon");
    pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const jwk = { ...await exportJWK(pair.publicKey), kid: "provider-key", alg: "EdDSA", use: "sig" };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ keys: [jwk] }))));
    memory = identityMemory();
    emails = { requestEmailCode: vi.fn(), verifyEmailCode: vi.fn(), requestAdminStepUpCode: vi.fn(), verifyAdminStepUpCode: vi.fn() };
    limiter = new AuthRateLimiter({ store: new InMemoryRateLimitStore(), nodeEnv: "production", identifierHashSecret: "test-identifier-secret" });
    const jwt = new JwtService({ secret: "test-app-session-secret-at-least-32-characters" });
    const verifier = new NeonTokenVerifier(config);
    const service = new NeonAuthService(memory.prisma as never, jwt, verifier, config, limiter);
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-app-session-secret-at-least-32-characters" })], controllers: [AuthController],
      providers: [AuthGuard, AdminGuard, AuthenticatedUserService,
        { provide: PrismaService, useValue: memory.prisma }, { provide: AuthService, useValue: emails },
        { provide: AuthRateLimiter, useValue: limiter }, { provide: NeonAuthService, useValue: service }]
    }).compile();
    app = moduleRef.createNestApplication(); app.useLogger(false); app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  async function token(claims: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: "real-provider-subject", id: "real-provider-subject", iss: config.issuer, aud: config.audience, iat: now, exp: now + 900,
      email: "person@example.test", emailVerified: true, banned: false, role: "ADMIN", adminReauthenticatedAt: now, ...claims })
      .setProtectedHeader({ alg: "EdDSA", kid: "provider-key" }).sign(pair.privateKey);
  }
  it("exchanges signed verified identity for a real application account and authenticated shared APIs", async () => {
    const http = request(app.getHttpServer());
    const response = await http.post("/api/v1/auth/neon/exchange").send({ token: await token() }).expect(201);
    expect(response.body.user).toMatchObject({ email: "person@example.test", role: "USER" });
    expect(response.body.accessToken).not.toBe("real-provider-subject");
    const me = await http.get("/api/v1/auth/me").auth(response.body.accessToken, { type: "bearer" }).expect(200);
    expect(me.body).toEqual(response.body.user); expect(me.body.adminReauthenticatedAt).toBeUndefined();
    expect(memory.state.bindings).toHaveLength(1);
  });
  it("rejects client role injection, URL overrides, oversized bodies and unverified claims", async () => {
    const http = request(app.getHttpServer()); const signed = await token();
    for (const extra of [{ role: "ADMIN" }, { issuer: "https://evil.test" }, { jwksUrl: "https://evil.test/keys" }]) {
      await http.post("/api/v1/auth/neon/exchange").send({ token: signed, ...extra }).expect(400);
    }
    await http.post("/api/v1/auth/neon/exchange").send({ token: "x".repeat(8193) }).expect(400);
    await http.post("/api/v1/auth/neon/exchange").send({ token: await token({ emailVerified: false }) }).expect(401);
    expect(memory.state.users).toHaveLength(0);
  });
  it("applies distributed authentication rate policy before verification", async () => {
    vi.spyOn(limiter, "enforce").mockRejectedValueOnce(new ServiceUnavailableException("Authentication temporarily unavailable"));
    const response = await request(app.getHttpServer()).post("/api/v1/auth/neon/exchange").send({ token: await token() });
    expect(response.status).toBe(503); expect(memory.state.users).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps email codes unavailable in Neon mode and the bridge unavailable in default email mode", async () => {
    const http = request(app.getHttpServer());
    await http.post("/api/v1/auth/email-code").send({ email: "person@example.test" }).expect(503);
    await http.post("/api/v1/auth/verify-email").send({ email: "person@example.test", code: "123456" }).expect(503);
    expect(emails.requestEmailCode).not.toHaveBeenCalled(); expect(emails.verifyEmailCode).not.toHaveBeenCalled();
    memory.state.users.push({ id: "existing-admin", email: "admin@example.test", role: "ADMIN" });
    const administrator = await new JwtService({ secret: "test-app-session-secret-at-least-32-characters" }).signAsync({ sub: "existing-admin" }, { expiresIn: "1h" });
    await http.post("/api/v1/auth/admin-step-up/email-code").auth(administrator, { type: "bearer" }).send({}).expect(503);
    await http.post("/api/v1/auth/admin-step-up/verify").auth(administrator, { type: "bearer" }).send({ code: "123456" }).expect(503);
    expect(emails.requestAdminStepUpCode).not.toHaveBeenCalled(); expect(emails.verifyAdminStepUpCode).not.toHaveBeenCalled();
    vi.stubEnv("AUTH_PROVIDER", "email");
    await http.post("/api/v1/auth/neon/exchange").send({ token: await token() }).expect(503);
    expect(memory.state.users).toHaveLength(1);
  });
});

it("can initialize Neon authentication in production without creating a Resend sender or weakening other auth settings", async () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OTP_HASH_SECRET", "test-otp-secret-with-at-least-32-characters");
  vi.stubEnv("SECURITY_IDENTIFIER_HASH_SECRET", "test-identifier-secret-with-at-least-32-characters");
  vi.stubEnv("EMAIL_SENDER", ""); vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("EMAIL_FROM", "");
  const moduleRef = await Test.createTestingModule({ imports: [JwtModule.register({ global: true, secret: "test-jwt-secret" }), PrismaModule, AuthModule] })
    .overrideProvider(PrismaService).useValue({})
    .overrideProvider(AUTH_RATE_LIMIT_STORE).useValue(new InMemoryRateLimitStore()).compile();
  try {
    const sender = moduleRef.get<{ sendVerificationCode(input: unknown): Promise<unknown> }>(EMAIL_SENDER);
    await expect(sender.sendVerificationCode({ email: "person@example.test" })).rejects.toThrow("Email delivery unavailable");
    expect(moduleRef.get(NeonAuthService)).toBeInstanceOf(NeonAuthService);
  } finally { await moduleRef.close(); vi.unstubAllEnvs(); }
});
