// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationFormExperience } from "../components/marketplace/application-experiences";
import { clearStoredAuthSession } from "../lib/auth-session";
import { getBrowserStorage } from "../lib/browser-storage";
import { createPreviewListings } from "../lib/preview-data";
import { readStoredRoommatePreference, writeStoredRoommatePreference } from "../lib/roommate-preference-storage";
import { clearStoredAdminStepUpSession, readStoredAdminStepUpSession, writeStoredAdminStepUpSession } from "../lib/admin-step-up";

beforeEach(() => { clearStoredAuthSession(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it.each(["getter", "write"])("keeps application forms editable when session storage denies its %s", (denied) => {
  if (denied === "getter") vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  else vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  render(<ApplicationFormExperience listing={createPreviewListings()[0]} />);
  expect(screen.getByRole("status").textContent).toContain("浏览器无法保存草稿");
  fireEvent.change(screen.getByPlaceholderText("你的姓名"), { target: { value: "Lin" } });
  fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "lin@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("UCLA / Product Intern"), { target: { value: "UCLA" } });
  fireEvent.click(screen.getByRole("button", { name: "继续" }));
  expect(screen.getByText("确认日期落在房源可租范围内。")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "继续" }));
  fireEvent.click(screen.getByRole("button", { name: "继续" }));
  fireEvent.click(screen.getByRole("button", { name: "提交申请" }));
  expect(screen.getByRole("alert").textContent).toContain("请先登录，再返回填写申请");
  expect(screen.getByText("Lin · lin@example.com")).toBeTruthy();
});

it("fails closed and keeps optional cleanup safe when privileged storage is denied", () => {
  const storage = {
    getItem() { throw new DOMException("Blocked", "SecurityError"); },
    setItem() { throw new DOMException("Blocked", "SecurityError"); },
    removeItem() { throw new DOMException("Blocked", "SecurityError"); }
  } as unknown as Storage;
  const identity = { id: "admin", email: "admin@example.com" };
  expect(readStoredAdminStepUpSession(storage, identity)).toBeNull();
  expect(() => writeStoredAdminStepUpSession(storage, identity, { accessToken: "enhanced", reauthenticatedUntil: "2099-01-01T00:00:00Z" })).not.toThrow();
  expect(() => clearStoredAdminStepUpSession(storage)).not.toThrow();
  expect(readStoredAdminStepUpSession(null, identity)).toBeNull();
});

it("handles blocked browser storage getters while retaining preference defaults", () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  const fallback = { gender: "Open" as const, budgetMin: 1000, budgetMax: 2000, schools: [], hobbies: [] };
  expect(getBrowserStorage("localStorage")).toBeNull();
  expect(readStoredRoommatePreference(fallback)).toEqual(fallback);
  expect(() => writeStoredRoommatePreference(fallback)).not.toThrow();
});

it.each(["fractional step", "invalid enums"])("ignores a saved application with %s", (invalid) => {
  const listing = createPreviewListings()[0];
  sessionStorage.setItem(`sublet_application_draft:guest:${listing.id}`, JSON.stringify({
    version: 1, step: invalid === "fractional step" ? 1.5 : 1, name: "Tampered", email: "lin@example.com",
    draft: { scope: "SOLO", moveIn: "", moveOut: "", schoolOrOccupation: "UCLA", note: "", incomeBand: invalid === "invalid enums" ? "invalid" : "TWO_TO_THREE_X", guarantorStatus: "AVAILABLE" }
  }));
  render(<ApplicationFormExperience listing={listing} />);
  expect((screen.getByPlaceholderText("你的姓名") as HTMLInputElement).value).toBe("");
  expect(screen.getByPlaceholderText("UCLA / Product Intern")).toBeTruthy();
});
