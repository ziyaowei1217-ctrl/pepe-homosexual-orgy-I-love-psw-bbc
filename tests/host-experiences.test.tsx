// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getHostApplicationPresentation,
  HostApplicationsExperience,
  HostDashboardExperience,
  HostListingEditorExperience,
  HostListingsExperience
} from "../components/marketplace/host-experiences";
import { PublishingFlow } from "../components/sublet-app";
import { writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("host workspace experiences", () => {
  it("shows the submitted income and guarantor information before a host makes a decision", async () => {
    writeStoredAuthSession("owner-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "owner-1", email: "owner@example.test", role: "USER" });
      if (url.endsWith("/profiles/me")) return jsonResponse({ id: "profile-owner", email: "owner@example.test", displayName: "Host", role: "lister" });
      if (url.endsWith("/applications/host-inbox")) return jsonResponse([{
        id: "app-1", listingId: "listing-1", listingTitle: "Westwood room", listingOwnerId: "owner-1",
        submitterId: "renter-1", teamId: null, scope: "SOLO", status: "SUBMITTED",
        memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }], moveIn: "2026-10-01T00:00:00.000Z",
        moveOut: "2027-02-28T00:00:00.000Z", schoolOrOccupation: "UCLA", incomeBand: "ABOVE_FOUR_X",
        guarantorStatus: "NOT_AVAILABLE", contactName: "Lin", contactEmail: "lin@example.test", note: "Evening viewing please."
      }]);
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<HostApplicationsExperience />); });
    expect(nodeText(renderer.root)).toContain("高于月租 4 倍");
    expect(nodeText(renderer.root)).toContain("无法提供");
    expect(renderer.root.findAllByType("button").some((button) => nodeText(button) === "接受申请")).toBe(true);
  });

  it("keeps the host overview limited to operational priorities", () => {
    const html = renderToStaticMarkup(<HostDashboardExperience />);
    expect(html).toContain("今天需要处理什么");
    expect(html).toContain("待处理申请");
    expect(html).toContain("预约");
    expect(html).toContain("登录后读取实时数据");
    expect(html).not.toContain("Maya Chen");
    expect(html).not.toContain("室友推荐");
  });

  it("organizes listings by lifecycle state", () => {
    const html = renderToStaticMarkup(<HostListingsExperience />);
    for (const label of ["我的房源", "草稿", "审核中", "已发布", "已出租"]) expect(html).toContain(label);
    expect(html).toContain('href="/host/listings/new"');
    expect(html).not.toContain("Westwood 校园步行圈阳光主卧");
  });

  it("reviews candidates without mixing listing publication controls", () => {
    const html = renderToStaticMarkup(<HostApplicationsExperience />);
    expect(html).toContain("申请审核");
    expect(html).toContain("申请资料");
    expect(html).toContain("要求补充");
    expect(html).toContain("接受申请");
    expect(html).toContain("登录后读取真实申请");
    expect(html).not.toContain("上传房源图片");
  });

  it("localizes application status and changes the contact action after review", () => {
    expect(getHostApplicationPresentation("SUBMITTED")).toEqual({
      statusLabel: "等待房东处理",
      contactLabel: "要求补充"
    });
    expect(getHostApplicationPresentation("COMPLETED")).toEqual({
      statusLabel: "入住已确认",
      contactLabel: "联系申请人"
    });
  });

  it("focuses the first invalid field in the publishing flow", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<PublishingFlow initialDraft={null} isPublishing={false} token="owner-token" onSave={vi.fn()} />);
    });

    const next = renderer.root.findAllByType("button").find((button) => nodeText(button).includes("下一步"))!;
    await act(async () => next.props.onClick());

    const title = renderer.root.findAllByType("input")[0];
    expect(document.activeElement).toBe(title.element);
  });

  it("links a renter-profile publishing block to the role setting", async () => {
    writeStoredAuthSession("renter-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "renter-1", email: "renter@example.com", role: "USER" });
      if (url.endsWith("/profiles/me")) return jsonResponse({ id: "profile-1", email: "renter@example.com", displayName: "Renter", role: "renter" });
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HostListingEditorExperience />);
    });

    expect(nodeText(renderer.root)).toContain("请先在账户资料中将身份设置为房东");
    expect(renderer.root.findAllByType("a").some((link) => String(link.props.href).endsWith("/account/profile"))).toBe(true);
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : nodeText(child)).join("");
}
