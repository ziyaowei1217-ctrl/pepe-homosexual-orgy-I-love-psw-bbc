import { apiGet, apiPostIdempotent } from "./api";
import type { ApiRoommateTeam } from "./roommate-teams";

export type RentalApplicationScope = "SOLO" | "TEAM";
export type RentalApplicationStatus = "DRAFT" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CANCELLED" | "COMPLETED";
export type RentalIncomeBand = "BELOW_2X" | "TWO_TO_THREE_X" | "THREE_TO_FOUR_X" | "ABOVE_FOUR_X" | "PREFER_NOT_TO_SAY";
export type RentalGuarantorStatus = "AVAILABLE" | "NOT_AVAILABLE" | "NOT_NEEDED";

export type ApiRentalApplication = {
  id: string;
  listingId: string;
  listingOwnerId: string;
  submitterId: string;
  teamId: string | null;
  scope: RentalApplicationScope;
  status: RentalApplicationStatus;
  memberSnapshots: Array<{ userId: string; displayName: string }>;
  moveIn: string;
  moveOut: string;
  schoolOrOccupation: string;
  incomeBand: RentalIncomeBand;
  guarantorStatus: RentalGuarantorStatus;
  note: string;
  submittedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  withdrawnAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
};

export type RentalApplicationDraft = {
  scope: RentalApplicationScope;
  teamId?: string;
  moveIn: string;
  moveOut: string;
  schoolOrOccupation: string;
  incomeBand: RentalIncomeBand;
  guarantorStatus: RentalGuarantorStatus;
  note: string;
};

export function applicationScopeOptions(team: ApiRoommateTeam | null) {
  const options: Array<{ value: RentalApplicationScope; label: string }> = [{ value: "SOLO", label: "个人申请" }];
  if (team?.status === "ACTIVE" && team.members.filter((member) => member.active).length === 2) {
    options.push({ value: "TEAM", label: "两人小组申请" });
  }
  return options;
}

export function validateRentalApplicationDraft(
  draft: RentalApplicationDraft,
  listing: { availableFrom?: string; availableTo?: string }
) {
  const errors: string[] = [];
  if (!draft.moveIn) errors.push("请选择入住日期。");
  if (!draft.moveOut) errors.push("请选择退租日期。");
  if (draft.moveIn && draft.moveOut && draft.moveOut <= draft.moveIn) errors.push("退租日期必须晚于入住日期。");
  if (
    draft.moveIn &&
    draft.moveOut &&
    listing.availableFrom &&
    listing.availableTo &&
    (draft.moveIn < listing.availableFrom.slice(0, 10) || draft.moveOut > listing.availableTo.slice(0, 10))
  ) errors.push("申请日期必须完整落在房源可租日期内。");
  if (!draft.schoolOrOccupation.trim()) errors.push("请填写学校或职业。");
  if (draft.schoolOrOccupation.trim().length > 140) errors.push("学校或职业不能超过 140 个字符。");
  if (draft.note.trim().length > 1000) errors.push("补充说明不能超过 1000 个字符。");
  if (draft.scope === "TEAM" && !draft.teamId) errors.push("请选择一个已确认小组。");
  return errors;
}

const statusCopy: Record<RentalApplicationStatus, { label: string; description: string }> = {
  DRAFT: { label: "草稿", description: "资料尚未提交给房东。" },
  SUBMITTED: { label: "等待房东处理", description: "申请已保存，房东可接受或拒绝。" },
  ACCEPTED: { label: "申请已接受", description: "可进入演示支付与资金状态。" },
  REJECTED: { label: "申请未通过", description: "本次申请已结束。" },
  WITHDRAWN: { label: "申请已撤回", description: "你或系统已撤回申请。" },
  CANCELLED: { label: "申请已取消", description: "接受后的申请已取消。" },
  COMPLETED: { label: "入住已确认", description: "双方确认入住，演示资金已释放。" }
};

export function getRentalApplicationStatusCopy(status: RentalApplicationStatus) {
  return statusCopy[status];
}

export function newIdempotencyKey(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function getMyRentalApplications(token: string) {
  return apiGet<ApiRentalApplication[]>("/applications/mine", token);
}

export function getHostRentalApplications(token: string) {
  return apiGet<ApiRentalApplication[]>("/applications/host-inbox", token);
}

export function createRentalApplication(
  token: string,
  listingId: string,
  draft: RentalApplicationDraft,
  idempotencyKey: string
) {
  return apiPostIdempotent<ApiRentalApplication>("/applications", {
    listingId,
    ...draft,
    teamId: draft.scope === "TEAM" ? draft.teamId : undefined,
    schoolOrOccupation: draft.schoolOrOccupation.trim(),
    note: draft.note.trim()
  }, token, idempotencyKey);
}

export function submitRentalApplication(token: string, id: string, idempotencyKey: string) {
  return apiPostIdempotent<ApiRentalApplication>(`/applications/${encodeURIComponent(id)}/submit`, {}, token, idempotencyKey);
}

export async function createAndSubmitRentalApplication(
  token: string,
  listingId: string,
  draft: RentalApplicationDraft,
  keys: { create: string; submit: string }
) {
  const created = await createRentalApplication(token, listingId, draft, keys.create);
  return submitRentalApplication(token, created.id, keys.submit);
}

export function withdrawRentalApplication(token: string, id: string, idempotencyKey: string) {
  return apiPostIdempotent<ApiRentalApplication>(`/applications/${encodeURIComponent(id)}/withdraw`, {}, token, idempotencyKey);
}

export function acceptRentalApplication(token: string, id: string, idempotencyKey: string) {
  return apiPostIdempotent<ApiRentalApplication>(`/applications/${encodeURIComponent(id)}/accept`, {}, token, idempotencyKey);
}

export function rejectRentalApplication(token: string, id: string, reason: string, idempotencyKey: string) {
  return apiPostIdempotent<ApiRentalApplication>(`/applications/${encodeURIComponent(id)}/reject`, { reason }, token, idempotencyKey);
}

export function cancelRentalApplication(token: string, id: string, reason: string, idempotencyKey: string) {
  return apiPostIdempotent<ApiRentalApplication>(`/applications/${encodeURIComponent(id)}/cancel`, { reason }, token, idempotencyKey);
}
