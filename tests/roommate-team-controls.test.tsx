import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { RoommateTeamControls } from "../components/roommate-team-controls";
import type { RoommateTeamAction } from "../lib/roommate-teams";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("RoommateTeamControls", () => {
  it.each([
    ["invite", "邀请组队"],
    ["outgoing", "等待对方确认"],
    ["incoming", "接受邀请"],
    ["active", "已组成两人小组"],
    ["unavailable", "双方互相喜欢后可邀请组队"]
  ] as const)("renders the %s server state", async (kind, expectedCopy) => {
    const renderer = await render(actionFor(kind));
    expect(renderedText(renderer)).toContain(expectedCopy);
    await unmount(renderer);
  });

  it("delegates invite, accept, decline, cancel, and leave commands", async () => {
    const handlers = {
      onInvite: vi.fn(),
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onCancel: vi.fn(),
      onLeave: vi.fn()
    };

    for (const kind of ["invite", "incoming", "outgoing", "active"] as const) {
      const renderer = await render(actionFor(kind), handlers);
      for (const button of renderer.root.findAllByType("button")) {
        await act(async () => button.props.onClick());
      }
      await unmount(renderer);
    }

    expect(handlers.onInvite).toHaveBeenCalledOnce();
    expect(handlers.onAccept).toHaveBeenCalledWith("invite-in");
    expect(handlers.onDecline).toHaveBeenCalledWith("invite-in");
    expect(handlers.onCancel).toHaveBeenCalledWith("invite-out");
    expect(handlers.onLeave).toHaveBeenCalledOnce();
  });

  it("keeps confirmed server copy visible while disabling commands during pending and errors", async () => {
    const renderer = await render(actionFor("incoming"), { pending: true, error: "请求失败，请重试" });
    expect(renderedText(renderer)).toContain("接受邀请");
    expect(renderedText(renderer)).toContain("请求失败，请重试");
    expect(renderer.root.findAllByType("button").every((button) => button.props.disabled === true)).toBe(true);
    await unmount(renderer);
  });
});

async function render(
  action: RoommateTeamAction,
  overrides: Partial<React.ComponentProps<typeof RoommateTeamControls>> = {}
) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <RoommateTeamControls
        action={action}
        pending={false}
        error={null}
        onInvite={() => undefined}
        onAccept={() => undefined}
        onDecline={() => undefined}
        onCancel={() => undefined}
        onLeave={() => undefined}
        {...overrides}
      />
    );
  });
  return renderer;
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => renderer.unmount());
}

function renderedText(renderer: ReactTestRenderer) {
  return renderer.root
    .findAll((node) => typeof node.children[0] === "string")
    .flatMap((node) => node.children.filter((child): child is string => typeof child === "string"))
    .join(" ");
}

function actionFor(kind: "invite" | "outgoing" | "incoming" | "active" | "unavailable"): RoommateTeamAction {
  if (kind === "invite") return { kind };
  if (kind === "unavailable") return { kind, reason: "双方互相喜欢后可邀请组队" };
  if (kind === "active") {
    return {
      kind,
      team: {
        id: "team-1",
        status: "ACTIVE",
        dealRoomId: "deal-room-1",
        confirmedAt: "2026-08-14T00:00:00.000Z",
        dissolvedAt: null,
        dissolvedById: null,
        dissolveReason: null,
        members: []
      }
    };
  }
  return {
    kind,
    invite: {
      id: kind === "incoming" ? "invite-in" : "invite-out",
      matchId: "match-a-b",
      inviterId: kind === "incoming" ? "user-b" : "user-a",
      inviteeId: kind === "incoming" ? "user-a" : "user-b",
      teamId: null,
      status: "PENDING",
      expiresAt: "2026-08-21T00:00:00.000Z",
      respondedAt: null
    }
  };
}
