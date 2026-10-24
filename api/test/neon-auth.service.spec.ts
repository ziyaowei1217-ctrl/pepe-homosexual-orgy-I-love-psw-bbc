import "reflect-metadata";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";
import { getNeonAuthConfig } from "../src/auth/auth-provider";
import { NeonAuthService } from "../src/auth/neon-auth.service";
import type { NeonVerifiedIdentity } from "../src/auth/neon-token-verifier";
import { identityMemory, type IdentityMemoryState } from "./support/neon-identity-memory";

const configuration = getNeonAuthConfig({ AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: "https://ep-identity-test.neonauth.us-east-2.aws.neon.tech/neondb/auth" })!;
const verified: NeonVerifiedIdentity = { issuer: configuration.issuer, subject: "neon-subject-1", email: "person@example.test", name: "Person", expiresAt: Date.now() + 900_000 };
function setup(publicSignup = false, initial: Partial<IdentityMemoryState> = {}) {
  const memory = identityMemory(initial); const jwt = new JwtService({ secret: "test-jwt-secret-with-at-least-32-characters" });
  const verifier = { verify: vi.fn().mockResolvedValue({ ...verified, role: "ADMIN", adminReauthenticatedAt: Math.floor(Date.now() / 1000) }) };
  const service = new NeonAuthService(memory.prisma as never, jwt, verifier as never, { ...configuration, publicSignup });
  return { memory, jwt, verifier, service };
}

describe("verified provider identity binding", () => {
  it("requires explicit public sign-up or an active invite before creating an account", async () => {
    const closed = setup();
    await expect(closed.service.exchange("signed-token")).rejects.toMatchObject({ status: 401 });
    expect(closed.memory.state.users).toEqual([]); expect(closed.memory.state.bindings).toEqual([]);
    const open = setup(true); const response = await open.service.exchange("signed-token");
    expect(response.user.role).toBe("USER"); expect(response.isNewUser).toBe(true);
    expect(open.memory.state.bindings[0]).toMatchObject({ issuer: configuration.issuer, subject: verified.subject, userId: response.user.id });
    const payload = await open.jwt.verifyAsync(response.accessToken, { algorithms: ["HS256"] });
    expect(payload.exp - payload.iat).toBe(3600); expect(payload.role).toBe("USER"); expect(payload.adminReauthenticatedAt).toBeUndefined();
    expect(open.memory.state.profiles[0]).not.toHaveProperty("eduEmailVerified", true);
  });
  it("marks the school email verified when the verified account email is a school address", async () => {
    for (const email of ["student@g.ucla.edu", "s@mail.utoronto.ca", "x@ucl.ac.uk", "y@student.unimelb.edu.au"]) {
      const current = setup(true);
      current.verifier.verify.mockResolvedValue({ ...verified, email } as never);
      await current.service.exchange("signed-token");
      expect(current.memory.state.profiles[0]).toMatchObject({ email, eduEmailVerified: true });
    }
    const existing = setup(false, { users: [{ id: "u1", email: "old@nyu.edu", role: "USER" }], profiles: [{ email: "old@nyu.edu", eduEmailVerified: false, displayName: "Kept" }] });
    existing.verifier.verify.mockResolvedValue({ ...verified, email: "old@nyu.edu" } as never);
    await existing.service.exchange("signed-token");
    expect(existing.memory.state.profiles[0]).toMatchObject({ eduEmailVerified: true, displayName: "Kept" });
  });
  it("atomically consumes one invitation and rejects revoked invitations", async () => {
    const invited = setup(false, { invites: [{ normalizedEmail: verified.email, claimedAt: null, revokedAt: null }] });
    await expect(invited.service.exchange("signed-token")).resolves.toMatchObject({ isNewUser: true });
    expect(invited.memory.state.invites[0].claimedAt).toBeInstanceOf(Date);
    const revoked = setup(false, { invites: [{ normalizedEmail: verified.email, claimedAt: null, revokedAt: new Date() }] });
    await expect(revoked.service.exchange("signed-token")).rejects.toMatchObject({ status: 401 });
    expect(revoked.memory.state.users).toHaveLength(0);
  });
  it("preserves existing database roles and never trusts upstream role or step-up claims", async () => {
    for (const role of ["USER", "ADMIN"] as const) {
      const current = setup(false, { users: [{ id: "existing-user", email: verified.email, role }] });
      const response = await current.service.exchange("signed-token");
      expect(response.user).toEqual({ id: "existing-user", email: verified.email, role });
      const payload = await current.jwt.verifyAsync(response.accessToken);
      expect(payload.role).toBe(role); expect(payload.adminReauthenticatedAt).toBeUndefined();
      expect(current.memory.state.users).toHaveLength(1);
    }
  });
  it("reuses the immutable subject binding without creating duplicate accounts or overwriting profiles", async () => {
    const current = setup(true); const first = await current.service.exchange("signed-token");
    current.memory.state.profiles[0].displayName = "Edited locally";
    const next = await current.service.exchange("signed-token");
    expect(next.user.id).toBe(first.user.id); expect(next.isNewUser).toBe(false);
    expect(current.memory.state.users).toHaveLength(1); expect(current.memory.state.bindings).toHaveLength(1);
    expect(current.memory.state.profiles[0].displayName).toBe("Edited locally");
  });
  it("rejects an email change instead of remapping the same subject to another person's account", async () => {
    const current = setup(true); const first = await current.service.exchange("signed-token");
    current.memory.state.users.push({ id: "other-person", email: "other@example.test", role: "ADMIN" });
    current.verifier.verify.mockResolvedValue({ ...verified, email: "other@example.test" } as never);
    await expect(current.service.exchange("signed-token")).rejects.toMatchObject({ status: 401 });
    expect(current.memory.state.bindings[0].userId).toBe(first.user.id);
    expect(current.memory.state.users.find(user => user.id === "other-person")?.role).toBe("ADMIN");
  });
  it("rejects a recycled email with a different provider subject", async () => {
    const current = setup(true); await current.service.exchange("signed-token");
    current.verifier.verify.mockResolvedValue({ ...verified, subject: "different-neon-person" } as never);
    await expect(current.service.exchange("signed-token")).rejects.toMatchObject({ status: 401 });
    expect(current.memory.state.bindings).toHaveLength(1); expect(current.memory.state.users).toHaveLength(1);
  });
  it("enforces the verified issuer/subject quota before opening an account transaction", async () => {
    const current = setup(true);
    const limiter = { enforce: vi.fn().mockRejectedValue(Object.assign(new Error("Quota infrastructure unavailable"), { status: 503 })) };
    const service = new NeonAuthService(current.memory.prisma as never, current.jwt, current.verifier as never, { ...configuration, publicSignup: true }, limiter as never);
    await expect(service.exchange("signed-token")).rejects.toMatchObject({ status: 503 });
    expect(limiter.enforce).toHaveBeenCalledWith("identity", "LOGIN", expect.objectContaining({ actorId: JSON.stringify([verified.issuer, verified.subject]) }));
    expect(current.memory.state.users).toHaveLength(0);
  });
  it("does not issue a session when verification fails or the proof expires during account lookup", async () => {
    const current = setup(true); current.verifier.verify.mockRejectedValueOnce(Object.assign(new Error("Invalid proof"), { status: 401 }));
    await expect(current.service.exchange("bad-token")).rejects.toMatchObject({ status: 401 });
    expect(current.memory.state.users).toHaveLength(0);
    current.verifier.verify.mockResolvedValue({ ...verified, expiresAt: Date.now() - 1 } as never);
    await expect(current.service.exchange("expired-proof")).rejects.toMatchObject({ status: 401 });
  });
});
