// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostListingEditorExperience, HostListingsExperience } from "../components/marketplace/host-experiences";
import { writeStoredAuthSession } from "../lib/auth-session";
import type { PublishDraft } from "../lib/publish-listing";

vi.mock("../components/sublet-app", () => ({ PublishingFlow: ({ initialDraft }: { initialDraft: PublishDraft | null }) =>
  <form aria-label="房源编辑表单"><input aria-label="房源标题" defaultValue={initialDraft?.title ?? ""} /></form>
}));
beforeEach(() => { writeStoredAuthSession("host-token"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const listing = { id: "existing", title: "我的 Westwood 房源", area: "Westwood", status: "DRAFT", price: 1800, trust: "待审核", tags: [], availableFrom: "2026-10-01", availableTo: "2027-01-01" };
function setup(load: () => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "host", email: "host@example.test", role: "USER" });
    if (url.endsWith("/profiles/me")) return Response.json({ id: "profile", displayName: "Host", role: "lister" });
    if (url.endsWith("/listings/mine")) return load();
    return Response.json({}, { status: 404 });
  }));
}

it("never turns an unavailable listing into a new-listing form", async () => {
  setup(() => Response.json([]));
  render(<HostListingEditorExperience listingId="missing" />);
  await screen.findByText("未找到这套房源，或你没有管理权限。");
  expect(screen.queryByRole("form", { name: "房源编辑表单" })).toBeNull();
  expect(screen.getByRole("link", { name: "返回我的房源" }).getAttribute("href")).toBe("/host/listings");
});

it("keeps an editor load failure out of the publishing flow and recovers the same listing on retry", async () => {
  let failed = true;
  setup(() => failed ? Response.json({}, { status: 503 }) : Response.json([listing]));
  render(<HostListingEditorExperience listingId="existing" />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("form", { name: "房源编辑表单" })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载房源" }));
  expect((await screen.findByLabelText("房源标题") as HTMLInputElement).value).toBe(listing.title);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows loading before an editor is ready", async () => {
  let finish!: (response: Response) => void;
  setup(() => new Promise<Response>((resolve) => { finish = resolve; }));
  render(<HostListingEditorExperience listingId="existing" />);
  await screen.findByText("正在加载房源…");
  expect(screen.queryByRole("form", { name: "房源编辑表单" })).toBeNull();
  await act(async () => { finish(Response.json([listing])); });
  await screen.findByLabelText("房源标题");
});

it("still permits intentionally creating a new listing", async () => {
  setup(() => Response.json([]));
  render(<HostListingEditorExperience />);
  expect((await screen.findByLabelText("房源标题") as HTMLInputElement).value).toBe("");
});

it("does not tell hosts their listings are empty while the request is still pending", async () => {
  let finish!: (response: Response) => void;
  setup(() => new Promise<Response>((resolve) => { finish = resolve; }));
  render(<HostListingsExperience />);
  await screen.findByText("正在加载房源…");
  expect(screen.queryByText("这个状态下还没有房源。")).toBeNull();
  await act(async () => { finish(Response.json([])); });
  await screen.findByText("这个状态下还没有房源。");
});

it("lets hosts recover a failed listing list without reloading the entire page", async () => {
  let failed = true;
  setup(() => failed ? Response.json({}, { status: 503 }) : Response.json([listing]));
  render(<HostListingsExperience />);
  await screen.findByRole("alert");
  expect(screen.queryByText("这个状态下还没有房源。")).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载房源" }));
  await screen.findByRole("heading", { name: listing.title });
  expect(screen.queryByRole("alert")).toBeNull();
});
