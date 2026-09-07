// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationDetailExperience,
  ApplicationFormExperience,
  ApplicationsExperience
} from "../components/marketplace/application-experiences";
import { writeStoredAuthSession } from "../lib/auth-session";
import { createPreviewListings } from "../lib/preview-data";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("rental application experiences", () => {
  it("starts a four-step application without exposing payment before acceptance", () => {
    const html = renderToStaticMarkup(<ApplicationFormExperience listing={createPreviewListings()[0]} />);

    expect(html).toContain("申请租住");
    expect(html).toContain("基本资料");
    expect(html).toContain("租住信息");
    expect(html).toContain("身份与材料");
    expect(html).toContain("确认提交");
    expect(html).not.toContain("支付房租");
  });

  it("separates pending applications from accepted trips", () => {
    const html = renderToStaticMarkup(<ApplicationsExperience />);

    expect(html).toContain("我的申请");
    expect(html).toContain("登录后查看真实申请状态");
    expect(html).not.toContain("Westwood 校园步行圈阳光主卧");
    expect(html).toContain('href="/trips"');
    expect(html).not.toContain("管理员审核");
  });

  it("opens the review step without submitting until the renter explicitly submits", async () => {
    writeStoredAuthSession("renter-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(application()));
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />);
    });

    change(renderer, "你的姓名", "Lin");
    change(renderer, "name@example.com", "lin@example.com");
    change(renderer, "UCLA / Product Intern", "UCLA student");
    await clickContinue(renderer);
    await clickContinue(renderer);
    const finalContinue = findButton(renderer, "继续");
    await act(async () => finalContinue.props.onClick());
    const submit = findButton(renderer, "提交申请");

    expect(text(renderer.root)).toContain("确认提交");
    expect(text(renderer.root)).toContain("提交申请");
    expect(submit.element).not.toBe(finalContinue.element);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks the basic step on a missing school or occupation and focuses that field", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />);
    });

    change(renderer, "你的姓名", "Lin");
    change(renderer, "name@example.com", "lin@example.com");
    await clickContinue(renderer);

    expect(text(renderer.root)).toContain("请填写学校或职业。");
    expect(text(renderer.root)).not.toContain("确认日期落在房源可租范围内。");
    expect(document.activeElement?.getAttribute("placeholder")).toBe("UCLA / Product Intern");

    change(renderer, "UCLA / Product Intern", "UCLA student");
    expect(text(renderer.root)).not.toContain("请填写学校或职业。");
  });

  it.each([false, true])("lets a renter reach and repair an overlong note after going back (reload: %s)", async (reload) => {
    const listing = createPreviewListings()[0];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={listing} />); });
    change(renderer, "你的姓名", "Lin");
    change(renderer, "name@example.com", "lin@example.com");
    change(renderer, "UCLA / Product Intern", "UCLA student");
    await clickContinue(renderer);
    await clickContinue(renderer);
    // Old saved drafts can exceed today's input limit; keep them editable.
    change(renderer, "介绍入住计划或想让房东了解的信息…", "a".repeat(1001));
    await act(async () => findButton(renderer, "上一步").props.onClick());
    if (reload) {
      renderer.unmount();
      await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={listing} />); });
    }

    await clickContinue(renderer);
    expect(renderer.root.findAllByType("textarea")[0]?.props.value).toBe("a".repeat(1001));
    await clickContinue(renderer);
    expect(text(renderer.root)).toContain("补充说明不能超过 1000 个字符。");
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    await act(async () => findButton(renderer, "上一步").props.onClick());
    expect(renderer.root.findAll((node) => node.props.role === "alert")).toHaveLength(0);
    await clickContinue(renderer);
    change(renderer, "介绍入住计划或想让房东了解的信息…", "a".repeat(1000));
    await clickContinue(renderer);
    expect(findButton(renderer, "提交申请")).toBeDefined();
  });

  it("advances the current step on form submit without sending an application early", async () => {
    writeStoredAuthSession("renter-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(application()));
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />); });
    change(renderer, "你的姓名", "Lin");
    change(renderer, "name@example.com", "lin@example.com");
    change(renderer, "UCLA / Product Intern", "UCLA student");
    await act(async () => renderer.root.findAllByType("form")[0].props.onSubmit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text(renderer.root)).toContain("确认日期落在房源可租范围内。");
  });

  it("lets the renter review income, guarantor and note before the final submission", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />); });
    change(renderer, "你的姓名", "Lin");
    change(renderer, "name@example.com", "lin@example.com");
    change(renderer, "UCLA / Product Intern", "UCLA student");
    await clickContinue(renderer);
    await clickContinue(renderer);
    const [income, guarantor] = renderer.root.findAllByType("select");
    act(() => income.props.onChange({ target: { value: "ABOVE_FOUR_X" } }));
    act(() => guarantor.props.onChange({ target: { value: "NOT_AVAILABLE" } }));
    change(renderer, "介绍入住计划或想让房东了解的信息…", "请确认房间网络。");
    await clickContinue(renderer);
    const review = renderer.root.findByProps({ "aria-labelledby": "review-title" });
    expect(text(review)).toContain("高于月租 4 倍");
    expect(text(review)).toContain("无法提供");
    expect(text(review)).toContain("请确认房间网络。");
  });

  it("restores the current-session application draft after the login round trip", async () => {
    const listing = createPreviewListings()[0];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationFormExperience listing={listing} />);
    });

    change(renderer, "你的姓名", "Lin Zhang");
    change(renderer, "name@example.com", "lin.zhang@example.com");
    change(renderer, "UCLA / Product Intern", "UCLA researcher");
    await clickContinue(renderer);
    await clickContinue(renderer);
    await clickContinue(renderer);
    expect(sessionStorage.getItem(`sublet_application_draft:guest:${listing.id}`)).toContain("Lin Zhang");

    renderer.unmount();
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationFormExperience listing={listing} />);
    });
    expect(text(renderer.root)).toContain("Lin Zhang · lin.zhang@example.com");
    expect(text(renderer.root)).toContain("UCLA researcher");
    expect(text(renderer.root)).toContain("提交申请");
  });

  it("does not expose one signed-in user's application draft to another account", async () => {
    const listing = createPreviewListings()[0];
    writeStoredAuthSession("owner-token");
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationFormExperience listing={listing} />);
    });
    change(renderer, "你的姓名", "Owner Private Draft");
    change(renderer, "name@example.com", "owner@example.com");
    change(renderer, "UCLA / Product Intern", "Private employer");
    renderer.unmount();

    writeStoredAuthSession("renter-token");
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationFormExperience listing={listing} />);
    });

    expect(renderer.root.findAll((node) => node.props.placeholder === "你的姓名")[0]?.props.value).toBe("");
    expect(text(renderer.root)).toContain("这些信息用于房东联系和识别申请。");
  });

  it("clears visible private edits when another account signs in in another tab", async () => {
    writeStoredAuthSession("first-account");
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />); });
    change(renderer, "你的姓名", "Private name");
    act(() => writeStoredAuthSession("second-account"));
    await act(async () => window.dispatchEvent(new Event("storage")));
    expect(renderer.root.findAll((node) => node.props.placeholder === "你的姓名")[0]?.props.value).toBe("");
  });

  it("restores form edits for the same account after bearer token rotation", async () => {
    const token = (stamp: number) => `header.${btoa(JSON.stringify({ sub: "same-user", iat: stamp }))}.signature`;
    writeStoredAuthSession(token(1));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />); });
    change(renderer, "你的姓名", "Preserved renter");
    renderer.unmount();
    writeStoredAuthSession(token(2));
    await act(async () => { renderer = TestRenderer.create(<ApplicationFormExperience listing={createPreviewListings()[0]} />); });
    expect(renderer.root.findAll((node) => node.props.placeholder === "你的姓名")[0]?.props.value).toBe("Preserved renter");
  });

  it("offers server draft continuation and withdrawal to its submitter", async () => {
    writeStoredAuthSession("renter-token");
    let status = "DRAFT";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/applications/mine")) return jsonResponse([{ ...application(), status }]);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "renter-1" });
      if (url.endsWith("/submit")) { status = "SUBMITTED"; return jsonResponse({ ...application(), status }); }
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationDetailExperience applicationId="application-1" />); });
    expect(text(renderer.root)).toContain("撤回申请");
    await act(async () => findButton(renderer, "继续提交").props.onClick());
    expect(text(renderer.root)).toContain("等待房东处理");
  });

  it("uses production checkout and status without calling demo routes", async () => {
    writeStoredAuthSession("renter-token");
    const routes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); routes.push(url);
      if (url.endsWith("/applications/mine")) return jsonResponse([application()]);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "renter-1" });
      if (url.endsWith("/payments/configuration")) return jsonResponse({ mode: "production" });
      if (url.endsWith("/applications/application-1") && !url.includes("/payments/")) return jsonResponse(application());
      if (url.endsWith("/payments/applications/application-1")) return jsonResponse({ status: "AWAITING_PAYMENT" });
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ApplicationDetailExperience applicationId="application-1" />); });
    expect(text(renderer.root)).toContain("继续付款");
    expect(routes.some((route) => route.includes("demo-payments"))).toBe(false);
  });

  it("uses the existing demo payment flow for an accepted application", async () => {
    writeStoredAuthSession("renter-token");
    const accepted = application();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/applications/mine")) return jsonResponse([accepted]);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "renter-1", email: "lin@example.com", role: "USER" });
      if (url.endsWith("/payments/configuration")) return jsonResponse({ mode: "demo" });
      if (url.includes("/demo-payments/by-application/")) return jsonResponse(paymentState(accepted));
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationDetailExperience applicationId={accepted.id} />);
    });

    const rendered = text(renderer.root);
    expect(rendered).toContain("演示支付与资金状态");
    expect(rendered).toContain("模拟支付成功");
    expect(rendered).not.toContain("继续付款");
  });
});

async function clickContinue(renderer: TestRenderer.ReactTestRenderer) {
  await act(async () => findButton(renderer, "继续").props.onClick());
}

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.findAllByType("button").find((node) => text(node).includes(label));
  expect(button).toBeDefined();
  return button!;
}

function change(renderer: TestRenderer.ReactTestRenderer, placeholder: string, value: string) {
  const input = renderer.root.findAll((node) => node.props.placeholder === placeholder)[0];
  expect(input).toBeDefined();
  act(() => input.props.onChange({ target: { value } }));
}

function application() {
  return {
    id: "application-1",
    listingId: "listing-1",
    listingTitle: "Westwood room",
    listingOwnerId: "owner-1",
    submitterId: "renter-1",
    teamId: null,
    scope: "SOLO" as const,
    status: "ACCEPTED" as const,
    memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }],
    moveIn: "2026-09-20T00:00:00.000Z",
    moveOut: "2027-01-01T00:00:00.000Z",
    schoolOrOccupation: "UCLA",
    incomeBand: "TWO_TO_THREE_X" as const,
    guarantorStatus: "AVAILABLE" as const,
    note: "Quiet"
  };
}

function paymentState(accepted: ReturnType<typeof application>) {
  return {
    disclaimer: "演示模式，不会真实扣款",
    payment: { id: "payment-1", applicationId: accepted.id, amountCents: 185000, currency: "USD", status: "AWAITING_ATTEMPT" },
    application: accepted,
    attempts: [],
    heldFund: null,
    ledgerEntries: []
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
