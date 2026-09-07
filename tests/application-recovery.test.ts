// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAndSubmitRentalApplication as submitApplicationRequest, type RentalApplicationDraft } from "../lib/rental-applications";
import { localDate } from "../lib/listing-stay";
import { writeStoredAuthSession } from "../lib/auth-session";

function createAndSubmitRentalApplication(...args: Parameters<typeof submitApplicationRequest>) {
  writeStoredAuthSession(args[0]);
  return submitApplicationRequest(...args);
}
const draft: RentalApplicationDraft = { scope: "SOLO", moveIn: "2027-01-01", moveOut: "2027-02-01", schoolOrOccupation: "Student", incomeBand: "TWO_TO_THREE_X", guarantorStatus: "AVAILABLE", note: "Quiet" };
afterEach(() => { sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("uses Los Angeles calendar date across UTC midnight and daylight saving", () => {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
  expect(localDate(new Date("2026-09-05T06:59:59Z"))).toBe("2026-09-04");
  expect(localDate(new Date("2026-01-05T07:59:59Z"))).toBe("2026-01-04");
  expect(localDate(new Date("2026-09-05T07:00:00Z"))).toBe("2026-09-05");
});
it("recovers a lost create response after reload and token rotation with one server draft", async () => {
  let created: Record<string, unknown> | null = null;
  let creates = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "user-1" });
    if (url.endsWith("/applications/mine")) return Response.json(created ? [created] : []);
    if (url.endsWith("/applications")) { creates++; created = { ...draft, id: "a-1", listingId: "l-1", submitterId: "user-1", status: "DRAFT" }; throw Error("lost response"); }
    if (url.endsWith("/submit")) return Response.json({ ...created, status: "SUBMITTED" });
    throw Error(url);
  }));
  await expect(createAndSubmitRentalApplication("old-token", "l-1", draft, { create: "first-create", submit: "first-submit" })).rejects.toThrow();
  const result = await createAndSubmitRentalApplication("new-token", "l-1", draft, { create: "second-create", submit: "second-submit" });
  expect(result.status).toBe("SUBMITTED");
  expect(creates).toBe(1);
});
it("retries a lost submit response with the original logical key and never sends edited data under the old create key", async () => {
  const submitKeys: string[] = [];
  let created: Record<string, unknown> | null = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "user-1" });
    if (url.endsWith("/applications/mine")) return Response.json(created ? [created] : []);
    if (url.endsWith("/applications")) { created = { ...draft, id: "a-1", listingId: "l-1", submitterId: "user-1", status: "DRAFT" }; return Response.json(created); }
    if (url.endsWith("/submit")) { submitKeys.push((init.headers as Record<string,string>)["Idempotency-Key"]); if(submitKeys.length === 1) throw Error("lost"); return Response.json({ ...created, status: "SUBMITTED" }); }
    throw Error(url);
  }));
  await expect(createAndSubmitRentalApplication("t", "l-1", draft, { create: "c", submit: "s" })).rejects.toThrow();
  await expect(createAndSubmitRentalApplication("t", "l-1", {...draft, note: "Edited"}, { create: "new-c", submit: "new-s" })).rejects.toThrow(/草稿/);
  expect((await createAndSubmitRentalApplication("t2", "l-1", draft, { create: "new-c", submit: "new-s" })).status).toBe("SUBMITTED");
  expect(submitKeys).toEqual(["s", "s"]);
});
it("replays an uncertain create with its original key while isolating another account", async () => {
  let userId = "one";
  const creates: Array<{ key: string; user: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: userId });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    if (url.endsWith("/applications")) {
      creates.push({ key: (init.headers as Record<string,string>)["Idempotency-Key"], user: userId });
      if (userId === "one") throw Error("Connection interrupted");
      return Response.json({ ...draft, id: "two-app", status: "DRAFT" });
    }
    return Response.json({ ...draft, id: "two-app", status: "SUBMITTED" });
  }));
  await expect(createAndSubmitRentalApplication("t1", "l", draft, { create: "one-key", submit: "one-submit" })).rejects.toThrow();
  await expect(createAndSubmitRentalApplication("t1-rotated", "l", draft, { create: "ignored", submit: "ignored-submit" })).rejects.toThrow();
  userId = "two";
  expect((await createAndSubmitRentalApplication("t2", "l", draft, { create: "two-key", submit: "two-submit" })).status).toBe("SUBMITTED");
  expect(creates).toEqual([{ user: "one", key: "one-key" }, { user: "one", key: "one-key" }, { user: "two", key: "two-key" }]);
});
it("starts a fresh request after the recovered server draft was withdrawn", async () => {
  let withdrawn = false;
  let creates = 0;
  const seenKeys: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json(withdrawn ? [{ ...draft, id: "old", listingId: "l", submitterId: "u", status: "WITHDRAWN" }] : []);
    if (url.endsWith("/applications")) {
      creates++; seenKeys.push((init.headers as Record<string,string>)["Idempotency-Key"]);
      if (creates === 1) throw Error("Lost create response");
      return Response.json({ ...draft, id: "new", status: "DRAFT" });
    }
    return Response.json({ ...draft, id: "new", status: "SUBMITTED" });
  }));
  await expect(createAndSubmitRentalApplication("t", "l", draft, { create: "old-key", submit: "old-submit" })).rejects.toThrow();
  withdrawn = true;
  await createAndSubmitRentalApplication("t", "l", draft, { create: "old-key", submit: "old-submit" });
  expect(seenKeys).toHaveLength(2);
  expect(seenKeys[0]).toBe("old-key");
  expect(seenKeys[1]).not.toBe("old-key");
});
it("preserves edits when a lost submit already committed instead of reporting the edited payload submitted", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/auth/me") ? { id: "u" } : [{ ...draft, id: "a", listingId: "l", submitterId: "u", status: "SUBMITTED" }])));
  await expect(createAndSubmitRentalApplication("t", "l", { ...draft, note: "New unsent edit" }, { create: "c", submit: "s" })).rejects.toThrow(/修改已保留/);
});
it("keeps SOLO and distinct TEAM attempts independent on the same listing", async () => {
  const seen: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    seen.push((init.headers as Record<string,string>)["Idempotency-Key"]);
    throw Error("Lost response");
  }));
  const requests = [draft, { ...draft, scope: "TEAM" as const, teamId: "team-a" }, { ...draft, scope: "TEAM" as const, teamId: "team-b" }];
  for (let round = 0; round < 2; round++) for (const [index, request] of requests.entries()) {
    await expect(createAndSubmitRentalApplication("t", "l", request, { create: `create-${round}-${index}`, submit: `submit-${round}-${index}` })).rejects.toThrow();
  }
  expect(seen).toEqual(["create-0-0", "create-0-1", "create-0-2", "create-0-0", "create-0-1", "create-0-2"]);
});
it("recovers only the matching scope and team server draft", async () => {
  const records = [
    { ...draft, id: "solo", scope: "SOLO", teamId: null },
    { ...draft, id: "team-a", scope: "TEAM", teamId: "a" },
    { ...draft, id: "team-b", scope: "TEAM", teamId: "b" }
  ].map((item) => ({ ...item, listingId: "l", submitterId: "u", status: "DRAFT" }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json(records);
    const record = records.find((item) => url.endsWith(`/${item.id}/submit`));
    if (!record) throw Error("Unexpected create");
    return Response.json({ ...record, status: "SUBMITTED" });
  }));
  const result = await createAndSubmitRentalApplication("t", "l", { ...draft, scope: "TEAM", teamId: "b" }, { create: "c", submit: "s" });
  expect(result.id).toBe("team-b");
});
it.each([{}, { keys: { create: 4, submit: "s" }, draft }, { keys: { create: "c", submit: "s" }, draft: {} }, { keys: { create: "c", submit: "s" }, draft, applicationId: 42 }, { keys: { create: "c", submit: "s" }, draft: { ...draft, contactName: 42 } }])("recovers a server draft despite malformed persisted attempt %j", async (malformed) => {
  let created = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json(created ? [{ ...draft, id: "a", listingId: "l", submitterId: "u", status: "DRAFT" }] : []);
    if (url.endsWith("/applications")) { created = true; throw Error("Lost create response"); }
    return Response.json({ ...draft, id: "a", status: "SUBMITTED" });
  }));
  await expect(createAndSubmitRentalApplication("t", "l", draft, { create: "c", submit: "s" })).rejects.toThrow();
  const storageKey = Object.keys(localStorage).find((key) => key.startsWith("sublet_application_attempt:"))!;
  localStorage.setItem(storageKey, JSON.stringify(malformed));
  expect((await createAndSubmitRentalApplication("t", "l", draft, { create: "new-c", submit: "new-s" })).status).toBe("SUBMITTED");
});
it.each([400, 401, 403, 404, 405, 410, 413, 415, 422])("allows corrected retry with fresh keys after definitive create rejection %i and reload", async (status) => {
  const requests: Array<{ key: string; note: string }> = [];
  const submitKeys: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    if (url.endsWith("/applications")) {
      requests.push({ key: (init.headers as Record<string,string>)["Idempotency-Key"], note: JSON.parse(init.body as string).note });
      if (requests.length === 1) return Response.json({ message: "Draft rejected" }, { status });
      return Response.json({ ...draft, id: "corrected", status: "DRAFT" });
    }
    submitKeys.push((init.headers as Record<string,string>)["Idempotency-Key"]);
    return Response.json({ ...draft, id: "corrected", note: "Corrected note", status: "SUBMITTED" });
  }));
  const originalKeys = { create: "original-create", submit: "original-submit" };
  await expect(createAndSubmitRentalApplication("old-token", "l", draft, originalKeys)).rejects.toMatchObject({ status });
  const result = await createAndSubmitRentalApplication("new-token", "l", { ...draft, note: "Corrected note" }, originalKeys);
  expect(result.status).toBe("SUBMITTED");
  expect(requests.map((request) => request.note)).toEqual(["Quiet", "Corrected note"]);
  expect(requests[1].key).not.toBe("original-create");
  expect(submitKeys).toHaveLength(1);
  expect(submitKeys[0]).not.toBe("original-submit");
});
it.each([408, 409, 429, 500, 502])("preserves uncertain create identity after HTTP %i", async (status) => {
  let creates = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    creates++;
    return Response.json({ message: "Uncertain result" }, { status });
  }));
  await expect(createAndSubmitRentalApplication("t", "l", draft, { create: "c", submit: "s" })).rejects.toMatchObject({ status });
  await expect(createAndSubmitRentalApplication("t2", "l", { ...draft, note: "Edited" }, { create: "new", submit: "new-s" })).rejects.toThrow(/尚待确认/);
  expect(creates).toBe(1);
});


it.each(["/auth/me", "/applications/mine", "/applications", "/submit"])("stops the recovery chain when the session changes during %s", async switchedAt => {
  writeStoredAuthSession("old-token");
  const mutations: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1/, "");
    if (init?.method === "POST") mutations.push(path);
    if (path.endsWith(switchedAt)) writeStoredAuthSession("new-account-token");
    if (path === "/auth/me") return Response.json({ id: "old-user" });
    if (path === "/applications/mine") return Response.json([]);
    return Response.json({ ...draft, id: "a", status: path.endsWith("/submit") ? "SUBMITTED" : "DRAFT" });
  }));
  await expect(submitApplicationRequest("old-token", "listing", draft, { create: "create-session", submit: "submit-session" }))
    .rejects.toThrow(/登录状态已改变/);
  expect(mutations).toEqual(switchedAt === "/submit" ? ["/applications", "/applications/a/submit"] : switchedAt === "/applications" ? ["/applications"] : []);
});

it("sends normalized contact details in the create request", async () => {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    if (url.endsWith("/applications")) body = JSON.parse(init.body as string);
    return Response.json({ ...draft, id: "a", status: url.endsWith("/submit") ? "SUBMITTED" : "DRAFT" });
  }));
  await createAndSubmitRentalApplication("t", "listing", { ...draft, contactName: "  Entered Contact  ", contactEmail: "  entered@example.com  " } as RentalApplicationDraft, { create: "create-contact", submit: "submit-contact" });
  expect(body).toMatchObject({ contactName: "Entered Contact", contactEmail: "entered@example.com" });
});

it.each(["DRAFT", "SUBMITTED"])("preserves new contact edits when recovering an older %s application", async status => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return Response.json({ id: "u" });
    if (url.endsWith("/applications/mine")) return Response.json([{ ...draft, id: "a", listingId: "l", submitterId: "u", status, contactName: "Old Contact", contactEmail: "old@example.com" }]);
    return Response.json({ ...draft, id: "a", status: "SUBMITTED" });
  }));
  await expect(createAndSubmitRentalApplication("t", "l", { ...draft, contactName: "Edited Contact", contactEmail: "edited@example.com" } as RentalApplicationDraft, { create: "create-contact", submit: "submit-contact" }))
    .rejects.toThrow(/修改已保留/);
});
