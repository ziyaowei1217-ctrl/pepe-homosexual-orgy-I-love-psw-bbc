import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RentalApplicationPanel } from "../components/rental-application-panel";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe("RentalApplicationPanel", () => {
  it("completes the short flow and creates then submits with stable command keys", async () => {
    const submitted = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(application({ status: "DRAFT" })))
      .mockResolvedValueOnce(jsonResponse(application({ status: "SUBMITTED" })));
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <RentalApplicationPanel
          listing={{ id: "listing-1", title: "Westwood room", price: 1850, availableFrom: "2026-09-01", availableTo: "2027-01-01" }}
          token="token-1"
          team={null}
          profile={{ displayName: "Lin", school: "UCLA" }}
          onClose={() => undefined}
          onSubmitted={submitted}
        />
      );
    });

    expect(text(renderer.root)).toContain("个人申请");
    expect(text(renderer.root)).not.toContain("两人小组申请");
    await click(renderer, "下一步");
    await click(renderer, "确认资料");
    await click(renderer, "提交申请");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    const submitHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(createHeaders["Idempotency-Key"]).toEqual(expect.any(String));
    expect(submitHeaders["Idempotency-Key"]).toEqual(expect.any(String));
    expect(createHeaders["Idempotency-Key"]).not.toBe(submitHeaders["Idempotency-Key"]);
    expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ status: "SUBMITTED" }));
  });
});

async function click(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.findAllByType("button").find((node) => text(node).includes(label));
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.props.onClick());
}

function application(overrides: Record<string, unknown>) {
  return {
    id: "application-1",
    listingId: "listing-1",
    listingOwnerId: "owner-1",
    submitterId: "renter-1",
    teamId: null,
    scope: "SOLO",
    status: "DRAFT",
    memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }],
    moveIn: "2026-09-01T00:00:00.000Z",
    moveOut: "2027-01-01T00:00:00.000Z",
    schoolOrOccupation: "UCLA",
    incomeBand: "TWO_TO_THREE_X",
    guarantorStatus: "AVAILABLE",
    note: "",
    ...overrides
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
