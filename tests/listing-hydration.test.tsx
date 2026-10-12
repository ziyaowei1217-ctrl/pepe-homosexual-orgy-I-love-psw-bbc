// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { createPreviewListings } from "../lib/preview-data";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.innerHTML = ""; vi.useRealTimers(); });
it("hydrates listing dates consistently when LA midnight falls between server render and hydration", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T06:59:59.900Z"));
  const listing = { ...createPreviewListings()[0], availableFrom: "2026-09-01", availableTo: "2027-06-01" };
  const props = { listing, dateSnapshot: "2026-10-11" };
  const view = <SavedListingsProvider><ListingDetailExperience {...props} /></SavedListingsProvider>;
  document.body.innerHTML = `<div id="root">${renderToString(view)}</div>`;
  vi.setSystemTime(new Date("2026-10-12T07:00:00.100Z"));
  const failures: unknown[] = [];
  await act(async () => { root = hydrateRoot(document.getElementById("root")!, view, { onRecoverableError: error => failures.push(error) }); });
  expect(failures.map(String)).toEqual([]);
});
