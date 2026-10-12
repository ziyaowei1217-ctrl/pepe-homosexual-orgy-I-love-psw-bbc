import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { clearStoredAdminStepUpSession, getActiveAdminStepUpToken, readStoredAdminStepUpSession, writeStoredAdminStepUpSession } from "../lib/admin-step-up";

// Independent-factor UI cases live in admin-mfa.test.tsx.
describe("administrator proof storage", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-12T08:00:00.000Z")); });
  afterEach(() => { vi.useRealTimers(); });
  it("returns an enhanced token only before its server expiry", () => {
    const session = {
      accessToken: "enhanced",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    };

    expect(
      getActiveAdminStepUpToken(
        session,
        Date.parse("2026-08-12T08:00:00.000Z")
      )
    ).toBe("enhanced");
    expect(
      getActiveAdminStepUpToken(
        session,
        Date.parse("2026-08-12T08:30:00.000Z")
      )
    ).toBeNull();
  });

  it("fails closed when a session lacks a usable token or expiry", () => {
    const now = Date.parse("2026-08-12T08:00:00.000Z");

    expect(getActiveAdminStepUpToken(null, now)).toBeNull();
    expect(
      getActiveAdminStepUpToken(
        {
          accessToken: "",
          reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
        },
        now
      )
    ).toBeNull();
    expect(
      getActiveAdminStepUpToken(
        {
          accessToken: "enhanced",
          reauthenticatedUntil: "not-an-expiry"
        },
        now
      )
    ).toBeNull();
  });

  it("restores an unexpired enhanced session only for the same administrator", () => {
    const storage = new MemoryStorage();
    const session = {
      accessToken: "enhanced",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    };

    writeStoredAdminStepUpSession(storage, { id: "admin-1", email: "admin@example.com" }, session);

    expect(readStoredAdminStepUpSession(
      storage,
      { id: "admin-1", email: "admin@example.com" },
      Date.parse("2026-08-12T08:05:00.000Z")
    )).toEqual(session);
    expect(readStoredAdminStepUpSession(
      storage,
      { id: "admin-2", email: "other@example.com" },
      Date.parse("2026-08-12T08:05:00.000Z")
    )).toBeNull();
  });

  it("removes an expired enhanced session from tab storage", () => {
    const storage = new MemoryStorage();
    writeStoredAdminStepUpSession(storage, { id: "admin-1", email: "admin@example.com" }, {
      accessToken: "enhanced",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    });

    expect(readStoredAdminStepUpSession(
      storage,
      { id: "admin-1", email: "admin@example.com" },
      Date.parse("2026-08-12T08:30:00.000Z")
    )).toBeNull();
    clearStoredAdminStepUpSession(storage);
    expect(storage.length).toBe(0);
  });

});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
