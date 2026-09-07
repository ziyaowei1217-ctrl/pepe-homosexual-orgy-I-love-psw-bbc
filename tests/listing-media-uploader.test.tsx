import { writeStoredAuthSession } from "../lib/auth-session";
// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListingMediaUploader } from "../components/listing-media-uploader";
import { PublishScreen } from "../components/sublet-app";
import type { ListingMediaSummary } from "../lib/listing-media";

describe("ListingMediaUploader", () => {
  beforeEach(() => writeStoredAuthSession("token-1"));
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("recovers server media, reports the submission summary, and exposes only supported file types", async () => {
    const summaries: ListingMediaSummary[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      media({ id: "ready-1", storageStatus: "READY", kind: "卧室" }),
      media({ id: "failed-1", storageStatus: "FAILED", kind: "客厅", securityErrorCode: "IMAGE_CHECKSUM_MISMATCH" })
    ]), { status: 200, headers: { "Content-Type": "application/json" } })));

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ListingMediaUploader
          listingId="listing-1"
          token="token-1"
          disabled={false}
          onSummaryChange={(summary) => summaries.push(summary)}
        />
      );
    });

    const input = renderer.root.findByProps({ type: "file" });
    expect(input.props.accept).toBe("image/jpeg,image/png,image/webp");
    expect(input.props.multiple).toBe(true);
    expect(renderer.root.findAllByType("li").map((node) => text(node))).toEqual([
      expect.stringContaining("卧室"),
      expect.stringContaining("上传失败")
    ]);
    expect(summaries.at(-1)).toEqual({
      totalCount: 2,
      readyCount: 1,
      pendingCount: 0,
      failedCount: 1,
      mutationPending: false
    });
  });

  it("rejects unsupported files in the browser without starting an upload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ListingMediaUploader
          listingId="listing-1"
          token="token-1"
          disabled={false}
          onSummaryChange={() => undefined}
        />
      );
    });

    await act(async () => {
      renderer.root.findByProps({ type: "file" }).props.onChange({
        target: { files: [{ name: "bad.gif", type: "image/gif", size: 100 }] }
      });
    });

    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain("仅支持 JPEG、PNG 或 WebP");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not request remote media when legacy callers omit the session token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PublishScreen
          isPublishing={false}
          listings={[{
            id: "listing-1",
            title: "Westwood 主卧短租",
            area: "Los Angeles · Westwood",
            image: "",
            availableFrom: "2026-08-20",
            availableTo: "2026-12-31",
            price: 1680,
            originalPrice: 1900,
            beds: 1,
            baths: 1,
            commute: "步行 12 分钟到 UCLA",
            transit: "公交 5 分钟",
            trust: "房东知情声明 · 待平台审核",
            tags: ["带家具", "Wi-Fi", "房东知情"],
            score: 4.8,
            status: "DRAFT"
          }]}
          user={{ id: "owner-1", email: "owner@example.edu", role: "USER" }}
          publishAccess={{ status: "allowed", message: "" }}
          editingListingId="listing-1"
          onEditListing={() => undefined}
          onSave={vi.fn()}
        />
      );
    });

    await act(async () => {
      renderer.root.findAllByType("button")
        .find((node) => text(node).includes("图片与分类"))!
        .props.onClick();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces the editor with a locked confirmation immediately after review submission", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
      const payload = url.includes("/media")
        ? [media({ id: "ready-1", storageStatus: "READY" })]
        : [];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }));
    const onSave = vi.fn().mockResolvedValue({
      status: "submitted",
      remoteListingId: "listing-1",
      message: "房源已提交审核。"
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PublishScreen
          isPublishing={false}
          token="token-1"
          listings={[editableListing()]}
          user={{ id: "owner-1", email: "owner@example.edu", role: "USER" }}
          publishAccess={{ status: "allowed", message: "" }}
          editingListingId="listing-1"
          onEditListing={() => undefined}
          onSave={onSave}
        />
      );
    });

    await clickButton(renderer.root, "图片与分类");
    await clickButton(renderer.root, "预览与提交");
    await clickButton(renderer.root, "提交审核");
    await clickButton(renderer.root, "确认提交审核");

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ remoteListingId: "listing-1" }), true);
    expect(text(renderer.root)).toContain("房源已提交审核");
    expect(renderer.root.findAllByType("button").some((node) => text(node) === "保存草稿")).toBe(false);
    expect(renderer.root.findAllByType("button").some((node) => text(node).includes("提交审核"))).toBe(false);
  });
});

function editableListing() {
  return {
    id: "listing-1",
    title: "Westwood 主卧短租",
    area: "Los Angeles · Westwood",
    image: "",
    availableFrom: "2026-08-20",
    availableTo: "2026-12-31",
    price: 1680,
    originalPrice: 1900,
    beds: 1,
    baths: 1,
    commute: "步行 12 分钟到 UCLA",
    transit: "公交 5 分钟",
    trust: "房东知情声明 · 待平台审核",
    tags: ["带家具", "Wi-Fi", "房东知情"],
    score: 4.8,
    status: "DRAFT" as const
  };
}

async function clickButton(root: TestRenderer.ReactTestInstance, label: string) {
  const button = root.findAllByType("button").find((node) => text(node).includes(label));
  if (!button) {
    throw new Error(`Button ${label} was not found. Buttons: ${root.findAllByType("button").map(text).join(" | ")}. Screen: ${text(root)}`);
  }
  await act(async () => {
    button.props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function media(overrides: Record<string, unknown>) {
  return {
    id: "media-1",
    kind: "卧室",
    sortOrder: 0,
    mimeType: "image/png",
    sizeBytes: 100,
    checksum: "a".repeat(64),
    storageStatus: "READY",
    reviewStatus: "PENDING",
    securityErrorCode: null,
    uploadExpiresAt: null,
    finalizedAt: new Date().toISOString(),
    publishedAt: null,
    ...overrides
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
