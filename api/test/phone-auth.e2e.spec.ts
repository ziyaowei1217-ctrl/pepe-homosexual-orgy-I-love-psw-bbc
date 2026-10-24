import "reflect-metadata";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditService } from "../src/audit/audit.service";
import { AdminGuard } from "../src/auth/admin.guard";
import { AdminStepUpGuard } from "../src/auth/admin-step-up.guard";
import { AuthGuard } from "../src/auth/auth.guard";
import { AuthRateLimiter, InMemoryRateLimitStore } from "../src/auth/auth-rate-limit";
import { PHONE_AUTH_CONFIG } from "../src/auth/auth.tokens";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { PhoneAuthController } from "../src/auth/phone-auth.controller";
import { PhoneAuthService } from "../src/auth/phone-auth.service";
import { maskPhoneNumber, normalizePhoneNumber } from "../src/auth/phone-number";
import { DevelopmentPhoneVerificationProvider, type PhoneAuthConfig, type PhoneVerificationProvider } from "../src/auth/phone-verification-provider";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;
const secret = "test-app-session-secret-at-least-32-characters";

type Identity = { id: string; userId: string; phoneNumber: string; verifiedAt: Date };
function memoryDatabase() {
  const state = {
    users: [
      { id: "user-a", email: "a@example.test", role: "USER" },
      { id: "user-b", email: "b@example.test", role: "USER" },
      { id: "admin-1", email: "admin@example.test", role: "ADMIN" }
    ],
    identities: [] as Identity[],
    profiles: new Map<string, { phoneVerified: boolean }>(),
    audits: [] as Array<{ action: string; actorUserId?: string; metadata: unknown }>
  };
  const find = (where: { phoneNumber?: string; userId?: string }) =>
    state.identities.find((entry) => (where.phoneNumber ? entry.phoneNumber === where.phoneNumber : entry.userId === where.userId)) ?? null;
  const prisma = {
    user: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: { phoneIdentity?: unknown } }) => {
        const user = state.users.find((entry) => entry.id === where.id);
        if (!user) return null;
        return select?.phoneIdentity ? { ...user, phoneIdentity: state.identities.find((entry) => entry.userId === user.id) ?? null } : { ...user };
      }
    },
    phoneIdentity: {
      findUnique: async ({ where, include, select }: { where: { phoneNumber?: string; userId?: string }; include?: { user: boolean }; select?: { user?: unknown } }) => {
        const found = find(where);
        if (!found) return null;
        return include?.user || select?.user ? { ...found, user: state.users.find((user) => user.id === found.userId) } : { ...found };
      },
      upsert: async ({ where, update, create }: { where: { userId: string }; update: Partial<Identity>; create: Omit<Identity, "id"> }) => {
        const next = find(where);
        const phoneNumber = (next ? update.phoneNumber : create.phoneNumber)!;
        if (state.identities.some((entry) => entry.phoneNumber === phoneNumber && entry.userId !== where.userId)) {
          const { Prisma } = await import("@prisma/client");
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
        }
        if (next) { Object.assign(next, update); return next; }
        const created = { id: `phone-${state.identities.length + 1}`, ...create };
        state.identities.push(created);
        return created;
      },
      create: async ({ data }: { data: Omit<Identity, "id"> }) => {
        if (state.identities.some((entry) => entry.phoneNumber === data.phoneNumber || entry.userId === data.userId)) {
          const { Prisma } = await import("@prisma/client");
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
        }
        const created = { id: `phone-${state.identities.length + 1}`, ...data };
        state.identities.push(created);
        return created;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = state.identities.length;
        state.identities = state.identities.filter((entry) => entry.userId !== where.userId);
        return { count: before - state.identities.length };
      }
    },
    profile: {
      upsert: async ({ where, update, create }: { where: { email: string }; update: { phoneVerified: boolean }; create: { phoneVerified: boolean } }) => {
        state.profiles.set(where.email, { phoneVerified: (state.profiles.has(where.email) ? update : create).phoneVerified });
      },
      updateMany: async ({ where, data }: { where: { email: string }; data: { phoneVerified: boolean } }) => {
        if (state.profiles.has(where.email)) state.profiles.set(where.email, data);
        return { count: 1 };
      }
    },
    auditEvent: { create: async ({ data }: { data: { action: string; actorUserId?: string; metadata: unknown } }) => { state.audits.push(data); return data; } },
    $executeRaw: async () => 0,
    $transaction: async <T>(operation: (transaction: unknown) => Promise<T>) => operation(prisma)
  };
  return { state, prisma };
}

class RecordingProvider implements PhoneVerificationProvider {
  readonly name = "twilio-verify" as const;
  readonly sent: string[] = [];
  readonly checked: string[] = [];
  private readonly inner = new DevelopmentPhoneVerificationProvider();
  private readonly codes = new Map<string, string>();
  async start(phoneNumber: string) {
    this.sent.push(phoneNumber);
    const result = await this.inner.start(phoneNumber);
    if (result.status === "sent" && result.devCode) this.codes.set(phoneNumber, result.devCode);
    // A real provider never returns the code to the API.
    return { status: "sent" as const };
  }
  async check(phoneNumber: string, code: string) { this.checked.push(phoneNumber); return this.inner.check(phoneNumber, code); }
  codeFor(phoneNumber: string) { return this.codes.get(phoneNumber)!; }
}

describe("phone sign-in and linking HTTP boundary", () => {
  let app: INestApplication;
  let memory: ReturnType<typeof memoryDatabase>;
  let provider: RecordingProvider;
  let jwt: JwtService;
  let enabled = true;

  async function build(config: PhoneAuthConfig) {
    memory = memoryDatabase();
    jwt = new JwtService({ secret });
    const limiter = new AuthRateLimiter({ store: new InMemoryRateLimitStore(), nodeEnv: "production", identifierHashSecret: "test-identifier-secret" });
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [PhoneAuthController],
      providers: [AuthGuard, AdminGuard, AuthenticatedUserService, AuditService, PhoneAuthService,
        { provide: PrismaService, useValue: memory.prisma },
        { provide: AuthRateLimiter, useValue: limiter },
        { provide: PHONE_AUTH_CONFIG, useValue: config }]
    }).compile();
    app = moduleRef.createNestApplication(); app.useLogger(false); app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }

  beforeEach(async () => {
    provider = new RecordingProvider();
    enabled = true;
    await build({ enabled: true, regions: ["US_CA", "CN"], provider });
  });
  afterEach(async () => { await app?.close(); vi.restoreAllMocks(); });

  const session = (userId: string, email: string, role = "USER") => jwt.signAsync({ sub: userId, email, role }, { algorithm: "HS256", expiresIn: "1h" });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  async function link(userId: string, email: string, phoneNumber: string) {
    const http = request(app.getHttpServer());
    const token = await session(userId, email);
    await http.post("/api/v1/auth/phone/link/code").auth(token, { type: "bearer" }).send({ phoneNumber }).expect(200);
    await flush();
    const normalized = normalizePhoneNumber(phoneNumber, ["US_CA", "CN"])!;
    return http.post("/api/v1/auth/phone/link/verify").auth(token, { type: "bearer" }).send({ phoneNumber, code: provider.codeFor(normalized) }).expect(200);
  }

  it("links a verified number, then signs in with it and returns an ordinary application session", async () => {
    const http = request(app.getHttpServer());
    const linked = await link("user-a", "a@example.test", "(415) 555-2671");
    expect(linked.body).toMatchObject({ linked: true, phoneNumber: "+1 ••• ••• 2671" });
    expect(JSON.stringify(linked.body)).not.toContain("4155552671");
    expect(memory.state.profiles.get("a@example.test")).toEqual({ phoneVerified: true });

    const sent = await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+1 415 555 2671" }).expect(200);
    expect(sent.body).toEqual({ phoneNumber: "+1 ••• ••• 2671", expiresInSeconds: 600 });
    await flush();
    const signedIn = await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber: "4155552671", code: provider.codeFor("+14155552671") }).expect(200);
    expect(signedIn.body.user).toEqual({ id: "user-a", email: "a@example.test", role: "USER" });
    const claims = jwt.decode(signedIn.body.accessToken) as Record<string, number | string>;
    expect(claims.exp! as number - (claims.iat as number)).toBe(3600);
    expect(claims.adminReauthenticatedAt).toBeUndefined();
    expect(memory.state.audits.map((entry) => entry.action)).toEqual(["PHONE_LINKED", "PHONE_SIGN_IN"]);
  });

  it("never texts or discloses numbers that are not linked, and answers the same way", async () => {
    const http = request(app.getHttpServer());
    await link("user-a", "a@example.test", "+14155552671");
    provider.sent.length = 0;
    const known = await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671" }).expect(200);
    const unknown = await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155550199" }).expect(200);
    await flush();
    expect(Object.keys(unknown.body)).toEqual(Object.keys(known.body));
    expect(provider.sent).toEqual(["+14155552671"]);
    // Guesses at an unlinked number never reach the provider; the response is
    // padded to the same floor instead (see the timing test below).
    await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber: "+14155550199", code: "123456" }).expect(401);
    expect(provider.checked).not.toContain("+14155550199");
  });

  it("rejects wrong codes, reused codes and malformed or unsupported numbers", async () => {
    const http = request(app.getHttpServer());
    await link("user-a", "a@example.test", "+14155552671");
    await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671" }).expect(200);
    await flush();
    const code = provider.codeFor("+14155552671");
    const wrong = code === "000000" ? "111111" : "000000";
    const rejected = await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber: "+14155552671", code: wrong }).expect(401);
    expect(rejected.body.accessToken).toBeUndefined();
    await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber: "+14155552671", code }).expect(200);
    await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber: "+14155552671", code }).expect(401);
    for (const phoneNumber of ["+18765550123", "+447700900123", "+1900", "call me", "+1 (911) 555-0100", "1".repeat(40)]) {
      await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber }).expect(400);
    }
    await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671", role: "ADMIN" }).expect(400);
  });

  it("keeps one account per number and tells only the proven owner about a conflict", async () => {
    const http = request(app.getHttpServer());
    await link("user-a", "a@example.test", "+8613800138000");
    provider.sent.length = 0;
    const tokenB = await session("user-b", "b@example.test");
    // The second account gets the generic answer and no text is sent.
    const asked = await http.post("/api/v1/auth/phone/link/code").auth(tokenB, { type: "bearer" }).send({ phoneNumber: "13800138000" }).expect(200);
    expect(asked.body.phoneNumber).toBe(maskPhoneNumber("+8613800138000"));
    expect(provider.sent).toEqual([]);
    provider.checked.length = 0;
    await http.post("/api/v1/auth/phone/link/verify").auth(tokenB, { type: "bearer" }).send({ phoneNumber: "13800138000", code: "123456" }).expect(400);
    // The owner's pending code is never checked (and so never used up) by another account.
    expect(provider.checked).toEqual([]);
    expect(memory.state.identities.map((entry) => entry.userId)).toEqual(["user-a"]);
  });

  it("shows only the masked number to its owner and unlinks it", async () => {
    const http = request(app.getHttpServer());
    await http.get("/api/v1/auth/phone").expect(401);
    await link("user-a", "a@example.test", "+14155552671");
    const tokenA = await session("user-a", "a@example.test");
    const status = await http.get("/api/v1/auth/phone").auth(tokenA, { type: "bearer" }).expect(200);
    expect(status.body).toMatchObject({ enabled: true, linked: true, phoneNumber: "+1 ••• ••• 2671" });
    const other = await http.get("/api/v1/auth/phone").auth(await session("user-b", "b@example.test"), { type: "bearer" }).expect(200);
    expect(other.body).toMatchObject({ linked: false, phoneNumber: null });
    await http.post("/api/v1/auth/phone/unlink").auth(tokenA, { type: "bearer" }).expect(200);
    expect(memory.state.identities).toEqual([]);
    expect(memory.state.profiles.get("a@example.test")).toEqual({ phoneVerified: false });
    provider.sent.length = 0;
    await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671" }).expect(200);
    await flush();
    expect(provider.sent).toEqual([]);
  });

  it("limits texts per number before contacting the provider", async () => {
    const http = request(app.getHttpServer());
    await link("user-a", "a@example.test", "+14155552671");
    for (let index = 0; index < 3; index += 1) await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671" }).expect(200);
    const limited = await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671" }).expect(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("gives administrators a 30-minute step-up only after a code to their own linked number", async () => {
    const http = request(app.getHttpServer());
    const user = await session("user-a", "a@example.test");
    await http.post("/api/v1/auth/admin-step-up/phone-code").auth(user, { type: "bearer" }).expect(403);
    const admin = await session("admin-1", "admin@example.test", "ADMIN");
    const missing = await http.post("/api/v1/auth/admin-step-up/phone-code").auth(admin, { type: "bearer" }).expect(409);
    expect(missing.body.code).toBe("PHONE_NOT_LINKED");
    await link("admin-1", "admin@example.test", "+14155552672");
    // A phone linked moments ago (for example by a stolen session) is refused.
    const tooNew = await http.post("/api/v1/auth/admin-step-up/phone-code").auth(admin, { type: "bearer" }).expect(409);
    expect(tooNew.body.code).toBe("PHONE_TOO_NEW");
    memory.state.identities[0].verifiedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await http.post("/api/v1/auth/admin-step-up/phone-code").auth(admin, { type: "bearer" }).expect(200);
    const wrong = provider.codeFor("+14155552672") === "000001" ? "000002" : "000001";
    await http.post("/api/v1/auth/admin-step-up/phone-verify").auth(admin, { type: "bearer" }).send({ code: wrong }).expect(400);
    const verified = await http.post("/api/v1/auth/admin-step-up/phone-verify").auth(admin, { type: "bearer" }).send({ code: provider.codeFor("+14155552672") }).expect(200);
    const claims = jwt.decode(verified.body.accessToken) as { adminReauthenticatedAt: number; role: string };
    expect(claims.role).toBe("ADMIN");
    expect(Math.abs(claims.adminReauthenticatedAt - Date.now() / 1000)).toBeLessThan(5);
    const guard = new AdminStepUpGuard(memory.prisma as never, new AuditService(), { now: Date.now });
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { id: "admin-1", email: "admin@example.test", role: "ADMIN", adminReauthenticatedAt: claims.adminReauthenticatedAt } }) }), getClass: () => Object, getHandler: () => Object } as never;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    // Step-up texts are limited per administrator (three per hour).
    await http.post("/api/v1/auth/admin-step-up/phone-code").auth(admin, { type: "bearer" }).expect(429);
  });

  it("locks an administrator's linked phone and never accepts it alone for sign-in", async () => {
    const http = request(app.getHttpServer());
    const admin = await session("admin-1", "admin@example.test", "ADMIN");
    await link("admin-1", "admin@example.test", "+14155552672");
    const replace = await http.post("/api/v1/auth/phone/link/code").auth(admin, { type: "bearer" }).send({ phoneNumber: "+14155552673" }).expect(403);
    expect(replace.body.code).toBe("ADMIN_PHONE_LOCKED");
    await http.post("/api/v1/auth/phone/unlink").auth(admin, { type: "bearer" }).expect(403);
    provider.sent.length = 0;
    await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552672" }).expect(200);
    await flush();
    expect(provider.sent).toEqual([]);
    provider.checked.length = 0;
    await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber: "+14155552672", code: provider.codeFor("+14155552672") }).expect(401);
    // Sign-in guesses at an administrator's number cannot burn a pending step-up code.
    expect(provider.checked).toEqual([]);
    expect(memory.state.identities.map((entry) => entry.phoneNumber)).toEqual(["+14155552672"]);
  });

  it("refuses step-up once the administrator role is revoked mid-way", async () => {
    const http = request(app.getHttpServer());
    const admin = await session("admin-1", "admin@example.test", "ADMIN");
    await link("admin-1", "admin@example.test", "+14155552672");
    memory.state.identities[0].verifiedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await http.post("/api/v1/auth/admin-step-up/phone-code").auth(admin, { type: "bearer" }).expect(200);
    memory.state.users[2].role = "USER";
    await http.post("/api/v1/auth/admin-step-up/phone-verify").auth(admin, { type: "bearer" }).send({ code: provider.codeFor("+14155552672") }).expect(403);
  });

  it("requires a recent sign-in to link, replace or remove a phone", async () => {
    const http = request(app.getHttpServer());
    await link("user-a", "a@example.test", "+14155552671");
    const issuedAt = Math.floor(Date.now() / 1000) - 16 * 60;
    const stale = await jwt.signAsync({ sub: "user-a", email: "a@example.test", role: "USER", iat: issuedAt }, { algorithm: "HS256", expiresIn: "1h" });
    provider.sent.length = 0;
    const asked = await http.post("/api/v1/auth/phone/link/code").auth(stale, { type: "bearer" }).send({ phoneNumber: "+14155552673" }).expect(403);
    expect(asked.body.code).toBe("RECENT_SIGN_IN_REQUIRED");
    await http.post("/api/v1/auth/phone/link/verify").auth(stale, { type: "bearer" }).send({ phoneNumber: "+14155552673", code: "123456" }).expect(403);
    await http.post("/api/v1/auth/phone/unlink").auth(stale, { type: "bearer" }).expect(403);
    await flush();
    expect(provider.sent).toEqual([]);
    expect(memory.state.identities.map((entry) => entry.phoneNumber)).toEqual(["+14155552671"]);
    // Reading the status does not need a fresh sign-in.
    await http.get("/api/v1/auth/phone").auth(stale, { type: "bearer" }).expect(200);
  });

  it("pads phone responses to the configured floor whether or not a number is linked", async () => {
    await app.close();
    await build({ enabled: true, regions: ["US_CA"], provider, responseFloorMs: 150 });
    const http = request(app.getHttpServer());
    for (const phoneNumber of ["+14155550199", "+14155550198"]) {
      const started = Date.now();
      await http.post("/api/v1/auth/phone/sign-in/verify").send({ phoneNumber, code: "123456" }).expect(401);
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    }
  });

  it("reports unavailable without consuming limits when phone sign-in is off", async () => {
    await app.close();
    enabled = false;
    await build({ enabled: false });
    const http = request(app.getHttpServer());
    expect((await http.get("/api/v1/auth/phone/availability").expect(200)).body).toEqual({ enabled: false, regions: [] });
    const response = await http.post("/api/v1/auth/phone/sign-in/code").send({ phoneNumber: "+14155552671" }).expect(503);
    expect(response.body.code).toBe("PHONE_AUTH_UNAVAILABLE");
    expect(enabled).toBe(false);
  });
});
