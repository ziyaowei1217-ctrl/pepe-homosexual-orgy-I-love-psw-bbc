import { apiGet, apiPostIdempotent, getSessionUser } from "./api";
import { assertCurrentAuthSession } from "./auth-session";
import { ProductApiError } from "./product-errors";
import type { ApiRoommateTeam } from "./roommate-teams";

export type RentalApplicationScope = "SOLO" | "TEAM";
export type RentalApplicationStatus = "DRAFT" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CANCELLED" | "CANCELLATION_PENDING" | "COMPLETED";
export type RentalIncomeBand = "BELOW_2X" | "TWO_TO_THREE_X" | "THREE_TO_FOUR_X" | "ABOVE_FOUR_X" | "PREFER_NOT_TO_SAY";
export type RentalGuarantorStatus = "AVAILABLE" | "NOT_AVAILABLE" | "NOT_NEEDED";

export type ApiRentalApplication = {
  id: string;
  listingId: string;
  listingTitle?: string;
  listingOwnerId: string;
  submitterId: string;
  teamId: string | null;
  scope: RentalApplicationScope;
  status: RentalApplicationStatus;
  memberSnapshots: Array<{ userId: string; displayName: string }>;
  contactName?: string | null;
  contactEmail?: string | null;
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
  contactName?: string | null;
  contactEmail?: string | null;
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
  ACCEPTED: { label: "申请已接受", description: "可进入签约与付款流程。" },
  REJECTED: { label: "申请未通过", description: "本次申请已结束。" },
  WITHDRAWN: { label: "申请已撤回", description: "你或系统已撤回申请。" },
  CANCELLATION_PENDING: { label: "取消处理中", description: "正在确认付款或退款结果，请稍后刷新。" },
  CANCELLED: { label: "申请已取消", description: "接受后的申请已取消。" },
  COMPLETED: { label: "入住已确认", description: "双方已经确认入住。" }
};

export function getRentalApplicationStatusCopy(status: RentalApplicationStatus) {
  return statusCopy[status];
}

export function mergeRentalApplicationUpdate(
  current: ApiRentalApplication,
  updated: ApiRentalApplication
): ApiRentalApplication {
  return {
    ...current,
    ...updated,
    listingTitle: updated.listingTitle ?? current.listingTitle
  };
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

export function createPaymentCheckout(token: string, applicationId: string, idempotencyKey: string) {
  return apiPostIdempotent<{ checkoutUrl: string }>(
    `/payments/applications/${encodeURIComponent(applicationId)}/checkout`,
    {},
    token,
    idempotencyKey
  );
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
    contactName: draft.contactName?.trim() ?? null,
    contactEmail: draft.contactEmail?.trim() ?? null,
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
  assertCurrentAuthSession(token);
  // Resolve the authenticated account, never scope durable requests to a rotating bearer token.
  const user = await getSessionUser(token);
  assertCurrentAuthSession(token);
  const requestedScope = draft.scope === "TEAM" ? `TEAM:${encodeURIComponent(draft.teamId ?? "")}` : "SOLO";
  const storageKey = `sublet_application_attempt:${encodeURIComponent(user.id)}:${encodeURIComponent(listingId)}:${requestedScope}`;
  const sameScope = (item: RentalApplicationDraft | ApiRentalApplication) =>
    item.scope === draft.scope && (draft.scope === "SOLO" || item.teamId === draft.teamId);
  let attempt: ApplicationAttempt | null = null;
  const raw = window.localStorage.getItem(storageKey);
  if (raw) {
    try {
      const saved: unknown = JSON.parse(raw);
      if (isApplicationAttempt(saved) && sameScope(saved.draft)) attempt = saved;
    } catch { /* Recover from server below. */ }
  }
  if (attempt?.createRejected) {
    // A definitive rejection completed the old command without creating a draft.
    // Persisted rejection evidence survives reload and callers retaining their old keys.
    keys = { create: newIdempotencyKey("application-create"), submit: newIdempotencyKey("application-submit") };
    attempt = null;
  }
  const applications = await getMyRentalApplications(token);
  assertCurrentAuthSession(token);
  const existing = applications.find((item) => item.listingId === listingId && item.submitterId === user.id && sameScope(item) &&
    ["DRAFT", "SUBMITTED", "ACCEPTED", "CANCELLATION_PENDING"].includes(item.status));
  const sameDraft = (value: RentalApplicationDraft | ApiRentalApplication) => JSON.stringify(applicationPayload(value)) === JSON.stringify(applicationPayload(draft));
  if (existing) {
    if (existing.status !== "DRAFT") {
      window.localStorage.removeItem(storageKey);
      if (!sameDraft(existing)) throw new Error("已有申请已提交，当前修改已保留。请到我的申请查看或撤回原申请。");
      return existing;
    }
    if (!sameDraft(existing)) throw new Error("已有草稿与当前修改不同。修改已保留；请到我的申请继续或撤回原草稿后重试。");
    if (!attempt || (attempt.applicationId && attempt.applicationId !== existing.id)) attempt = { keys, draft };
    attempt.applicationId = existing.id;
  } else if (attempt?.applicationId || (attempt && applications.some((item) =>
    item.listingId === listingId && item.submitterId === user.id && sameScope(item) &&
    ["WITHDRAWN", "REJECTED", "CANCELLED", "COMPLETED"].includes(item.status) &&
    JSON.stringify(applicationPayload(item)) === JSON.stringify(applicationPayload(attempt!.draft))))) {
    // A mounted legacy form may still supply its original keys after withdrawal.
    if (attempt?.keys.create === keys.create) keys = {
      create: newIdempotencyKey("application-create"), submit: newIdempotencyKey("application-submit")
    };
    attempt = null;
  }
  if (attempt && !sameDraft(attempt.draft)) throw new Error("上次草稿请求结果尚待确认，当前修改已保留。请恢复原资料重试或到我的申请撤回草稿。");
  attempt ??= { keys, draft: { ...draft } };
  // Storage failure must stop before dispatch: otherwise a reload could lose request identity.
  window.localStorage.setItem(storageKey, JSON.stringify(attempt));
  if (!attempt.applicationId) {
    try {
      const created = await createRentalApplication(token, listingId, attempt.draft, attempt.keys.create);
      assertCurrentAuthSession(token);
      attempt.applicationId = created.id;
      window.localStorage.setItem(storageKey, JSON.stringify(attempt));
    } catch (caught) {
      if (caught instanceof ProductApiError && caught.status !== undefined &&
        [400, 401, 403, 404, 405, 410, 413, 415, 422].includes(caught.status)) {
        attempt.createRejected = true;
        window.localStorage.setItem(storageKey, JSON.stringify(attempt));
      }
      throw caught;
    }
  }
  assertCurrentAuthSession(token);
  const result = await submitRentalApplication(token, attempt.applicationId, attempt.keys.submit);
  assertCurrentAuthSession(token);
  window.localStorage.removeItem(storageKey);
  return result;
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

type ApplicationAttempt = {
  keys: { create: string; submit: string };
  draft: RentalApplicationDraft;
  applicationId?: string;
  createRejected?: boolean;
};

function isApplicationAttempt(value: unknown): value is ApplicationAttempt {
  if (!value || typeof value !== "object") return false;
  const saved = value as Partial<ApplicationAttempt>;
  if (!saved.keys || typeof saved.keys.create !== "string" || !saved.keys.create.trim() ||
    typeof saved.keys.submit !== "string" || !saved.keys.submit.trim()) return false;
  if (saved.applicationId !== undefined && (typeof saved.applicationId !== "string" || !saved.applicationId.trim())) return false;
  if (saved.createRejected !== undefined && typeof saved.createRejected !== "boolean") return false;
  if (saved.createRejected && saved.applicationId !== undefined) return false;
  const draft = saved.draft;
  if (!draft || typeof draft !== "object" || !["SOLO", "TEAM"].includes(draft.scope)) return false;
  if (draft.scope === "TEAM" && (typeof draft.teamId !== "string" || !draft.teamId.trim())) return false;
  if (draft.teamId !== undefined && typeof draft.teamId !== "string") return false;
  if ([draft.contactName, draft.contactEmail].some((field) => field != null && typeof field !== "string")) return false;
  return [draft.moveIn, draft.moveOut, draft.schoolOrOccupation, draft.note].every((field) => typeof field === "string") &&
    ["BELOW_2X", "TWO_TO_THREE_X", "THREE_TO_FOUR_X", "ABOVE_FOUR_X", "PREFER_NOT_TO_SAY"].includes(draft.incomeBand) &&
    ["AVAILABLE", "NOT_AVAILABLE", "NOT_NEEDED"].includes(draft.guarantorStatus);
}

function applicationPayload(draft: RentalApplicationDraft | ApiRentalApplication) {
  return { scope: draft.scope, teamId: draft.scope === "TEAM" ? draft.teamId : null,
    contactName: draft.contactName?.trim() ?? null, contactEmail: draft.contactEmail?.trim() ?? null,
    moveIn: draft.moveIn.slice(0, 10), moveOut: draft.moveOut.slice(0, 10),
    schoolOrOccupation: draft.schoolOrOccupation.trim(), incomeBand: draft.incomeBand,
    guarantorStatus: draft.guarantorStatus, note: draft.note.trim() };
}

export function applicationDraftScope(token: string | null) {
  if (!token) return "guest";
  // The subject only namespaces local form edits. Commands independently verify /auth/me.
  try {
    const subject = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub;
    if (typeof subject === "string" && subject) return `account-${encodeURIComponent(subject)}`;
  } catch { /* Opaque development tokens retain their isolated namespace. */ }
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `user-${(hash >>> 0).toString(36)}-${token.length}`;
}
