// @vitest-environment jsdom
// The seventh round, PR #8's screens on the design system: the view switch sits on the map instead of across the list,
// the map view keeps a page title, the assistant calls the person posting 转租人, and the roommate profile uses the
// site's date fields.

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SearchExperience } from "../components/marketplace/search-experience";
import { createPreviewListings } from "../lib/preview-data";
import { defaultSearch } from "../lib/search-state";

vi.mock("maplibre-gl", () => import("./support/fake-maplibre"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function search(view: "split" | "map" | "list") {
  return renderToStaticMarkup(<SavedListingsProvider><SearchExperience listings={createPreviewListings()} initialState={{ ...defaultSearch, view }} initialQuery="" initialMoveIn="" initialMoveOut="" /></SavedListingsProvider>);
}

it("puts the desktop view switch on the map in split view, so it never covers the list", () => {
  const html = search("split");
  const map = html.slice(html.indexOf('aria-label="房源地图"'));
  expect(map).toContain('aria-label="浏览方式"');
  // Exactly one switch: the floating one is for list view only.
  expect(html.match(/aria-label="浏览方式"/g)).toHaveLength(1);
  expect(search("list").match(/aria-label="浏览方式"/g)).toHaveLength(1);
});

it("keeps a page title in map view, where the list and its heading are hidden", () => {
  const html = search("map");
  expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
  expect(html).toMatch(/<h1 id="result-heading" class="sr-only">[^<]+可租房源<\/h1>/);
});

it("draws the focus ring on the box around a bare input, not a square inside a rounded box", () => {
  const html = search("split");
  expect(html).toMatch(/<form[^>]*aria-label="修改搜索"[^>]*class="field-shell /);
});

it("calls the person posting the room 转租人 in the assistant, and has no second page banner", async () => {
  const { writeStoredAuthSession } = await import("../lib/auth-session");
  writeStoredAuthSession("token-1");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ enabled: true })));
  vi.resetModules();
  const { PublicShell } = await import("../components/marketplace/public-shell");
  const { SavedListingsProvider } = await import("../components/marketplace/saved-listings-provider");
  await act(async () => { render(<SavedListingsProvider><PublicShell active="discover"><main>页面</main></PublicShell></SavedListingsProvider>); });
  (await screen.findByRole("button", { name: "打开 AI 助手" })).click();
  const dialog = await screen.findByRole("dialog", { name: "AI 助手" });
  expect(dialog.textContent).toContain("转租人");
  expect(dialog.textContent).not.toMatch(/房东(?!知情)/);
  expect(within(dialog).queryByRole("banner")).toBeNull();
  // The composer box carries the focus ring.
  expect(within(dialog).getByRole("textbox", { name: "问 AI 助手" }).closest(".field-shell")).toBeTruthy();
});

it("uses the site's date fields on the roommate profile", async () => {
  const { writeStoredAuthSession } = await import("../lib/auth-session");
  writeStoredAuthSession("token-1");
  const profile = { id: "rp", cardId: null, displayName: "林晓", age: 24, gender: "female", genderPreference: "any", school: "UCLA", city: "Los Angeles", budgetMin: 1200, budgetMax: 1600,
    moveInDate: "2026-12-15", moveOutDate: "2027-06-10", preferredNeighborhoods: [], roomType: null, sleepSchedule: null, cleanliness: null, guests: null, smoking: null, pets: null,
    dealbreakers: [], intro: null, lookingFor: null, status: "active" };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/roommate-profiles/me") ? Response.json({ profile })
    : String(input).endsWith("/profiles/me") ? Response.json({ id: "u", displayName: "林晓" }) : Response.json({ id: "u", email: "lin@example.test", role: "USER" })));
  const { RoommateProfileEditor } = await import("../components/marketplace/roommate-profile-form");
  await act(async () => { render(<RoommateProfileEditor />); });
  const moveIn = await screen.findByLabelText("入住日期") as HTMLInputElement;
  expect(moveIn.type).toBe("date");
  const field = moveIn.closest("label")!;
  expect(within(field).getByText(/12月15日/)).toBeTruthy();
  expect(field.textContent).not.toContain("12/15/2026");
});
