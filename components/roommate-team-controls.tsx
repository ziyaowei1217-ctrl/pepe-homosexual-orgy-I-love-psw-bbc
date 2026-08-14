"use client";

import { Button } from "@/components/ui/button";
import type { RoommateTeamAction } from "@/lib/roommate-teams";

export type RoommateTeamControlsProps = {
  action: RoommateTeamAction;
  pending: boolean;
  error: string | null;
  onInvite(): unknown;
  onAccept(inviteId: string): unknown;
  onDecline(inviteId: string): unknown;
  onCancel(inviteId: string): unknown;
  onLeave(): unknown;
};

export function RoommateTeamControls({
  action,
  pending,
  error,
  onInvite,
  onAccept,
  onDecline,
  onCancel,
  onLeave
}: RoommateTeamControlsProps) {
  return (
    <section aria-label="室友组队" className="space-y-3 rounded-[14px] border border-border bg-card p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">两人小组</h3>
        <TeamStateCopy action={action} />
      </div>

      {action.kind === "invite" ? (
        <Button disabled={pending} onClick={onInvite} size="sm">
          邀请组队
        </Button>
      ) : null}

      {action.kind === "outgoing" ? (
        <Button disabled={pending} onClick={() => onCancel(action.invite.id)} size="sm" variant="outline">
          取消邀请
        </Button>
      ) : null}

      {action.kind === "incoming" ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => onAccept(action.invite.id)} size="sm" variant="accept">
            接受邀请
          </Button>
          <Button disabled={pending} onClick={() => onDecline(action.invite.id)} size="sm" variant="outline">
            拒绝
          </Button>
        </div>
      ) : null}

      {action.kind === "active" ? (
        <Button disabled={pending} onClick={onLeave} size="sm" variant="outline">
          退出小组
        </Button>
      ) : null}

      {pending ? <p className="text-xs text-muted-foreground">处理中…</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function TeamStateCopy({ action }: { action: RoommateTeamAction }) {
  if (action.kind === "unavailable") {
    return <p className="text-xs text-muted-foreground">{action.reason}</p>;
  }
  if (action.kind === "outgoing") {
    return <p className="text-xs text-muted-foreground">等待对方确认</p>;
  }
  if (action.kind === "incoming") {
    return <p className="text-xs text-muted-foreground">对方邀请你组成两人小组</p>;
  }
  if (action.kind === "active") {
    return <p className="text-xs text-trust-green">已组成两人小组</p>;
  }
  return <p className="text-xs text-muted-foreground">确认后可共同申请房源</p>;
}
