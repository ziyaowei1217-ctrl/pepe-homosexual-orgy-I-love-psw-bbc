import { apiGet, apiPatch, apiPost, updateMyProfile, type ApiRoommateActionResponse } from "./api";
import { formatDateShort, formatRangeShort } from "./date-format";
import { ProductApiError } from "./product-errors";
import { formatUsd } from "./stay-price";

type RoommateFeatureKey = "dates" | "budget" | "area" | "school" | "roomType" | "sleep" | "clean" | "guests" | "smoking" | "pets" | "age";
type RoommateTier = "great" | "good" | "fair";
export type RoommateAction = "LIKE" | "PASS" | "LATER";

export type RoommateCard = {
  id: string;
  name: string;
  age: number;
  image: string;
  school: string | null;
  city: string | null;
  neighborhoods: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  moveInDate: string | null;
  moveOutDate: string | null;
  roomType: string | null;
  gender: string | null;
  sleepSchedule: string | null;
  cleanliness: string | null;
  guests: string | null;
  smoking: string | null;
  pets: string | null;
  intro: string | null;
  lookingFor: string | null;
  /** null without a viewer profile, or when a hard filter blocks the pair (watchouts then say why). */
  score: number | null;
  tier: RoommateTier | null;
  reasons: string[];
  watchouts: string[];
  icebreaker: string | null;
  breakdown: Array<{ key: RoommateFeatureKey; label: string; score: number }>;
  likedYou: boolean;
  youLiked: boolean;
  later: boolean;
  conversationId: string | null;
};

type RoommateMissingField = "age" | "gender" | "dates" | "budget" | "city" | "neighborhoods" | "roomType" | "sleepSchedule" | "cleanliness";

export type RoommateDeckResponse = {
  items: RoommateCard[];
  total: number;
  filteredOut: number;
  viewer: { signedIn: boolean; hasProfile: boolean; missing: RoommateMissingField[] };
};

export type MyRoommateProfile = {
  id: string;
  cardId: string | null;
  displayName: string | null;
  age: number | null;
  gender: string | null;
  genderPreference: string;
  school: string | null;
  city: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInDate: string | null;
  moveOutDate: string | null;
  preferredNeighborhoods: string[];
  roomType: string | null;
  sleepSchedule: string | null;
  cleanliness: string | null;
  guests: string | null;
  smoking: string | null;
  pets: string | null;
  dealbreakers: string[];
  intro: string | null;
  lookingFor: string | null;
  status: string;
};

export type RoommateProfileInput = Omit<MyRoommateProfile, "id" | "cardId" | "displayName" | "age" | "status"> & { age: number };

/** Stored codes and their Chinese labels; the form's choices and the card's facts both read from here. */
export const roommateLabels = {
  gender: { female: "女", male: "男", nonbinary: "非二元" },
  genderPreference: { any: "不限", female: "只找女生", male: "只找男生" },
  roomType: { private_room: "独立卧室", shared_room: "合住一间", entire_place: "整租" },
  sleepSchedule: { early_bird: "早睡早起", regular: "作息规律", night_owl: "夜猫子" },
  cleanliness: { relaxed: "随性", tidy: "整洁", very_tidy: "很爱干净" },
  guests: { rarely: "很少带朋友", sometimes: "偶尔带朋友", often: "经常带朋友" },
  smoking: { no: "不抽烟", outside: "只在室外抽", yes: "抽烟" },
  pets: { none: "没有宠物", has_pet: "养宠物" },
  dealbreakers: { smoking: "抽烟", pets: "宠物", night_owl: "夜猫子", frequent_guests: "经常带朋友" }
} as const;

export type RoommateField = keyof typeof roommateLabels;

/** Label for a stored code; legacy free text and empty values have none. */
export function roommateLabel(field: RoommateField, value: string | null | undefined): string | null {
  const labels: Record<string, string> = roommateLabels[field];
  return value != null && Object.hasOwn(labels, value) ? labels[value] : null;
}

export const tierLabels: Record<RoommateTier, string> = { great: "非常合拍", good: "很合适", fair: "可以聊聊" };

export const missingFieldLabels: Record<RoommateMissingField, string> = {
  age: "年龄",
  gender: "性别",
  dates: "入住时间",
  budget: "预算",
  city: "城市",
  neighborhoods: "想住的区域",
  roomType: "房型",
  sleepSchedule: "作息",
  cleanliness: "整洁习惯"
};

/** 「1/4 – 6/12」: the year shows only on a move-out date in a later year than the move-in. */
export function formatStay(moveIn: string | null, moveOut: string | null) {
  if (!moveIn) return null;
  const year = Number(moveIn.slice(0, 4));
  return moveOut ? formatRangeShort(moveIn, moveOut, year) : `${formatDateShort(moveIn, year)} 起`;
}

/** 「$1,200–1,600/月」. Like the API, a lone $0 bound counts as no budget. */
export function formatRoommateBudget(min: number | null, max: number | null) {
  if (max) return min === null ? `最高 ${formatUsd(max)}/月` : min === max ? `${formatUsd(min)}/月` : `${formatUsd(min)}–${max.toLocaleString("en-US")}/月`;
  return min ? `${formatUsd(min)} 起/月` : null;
}

export function getRoommateDeck(token: string | null, limit = 20) {
  return apiGet<RoommateDeckResponse>(`/roommates/deck?limit=${limit}`, token ?? undefined);
}

export function getRoommateCard(id: string, token: string | null) {
  return apiGet<RoommateCard>(`/roommates/deck/${encodeURIComponent(id)}`, token ?? undefined);
}

export function sendRoommateAction(token: string, id: string, action: RoommateAction) {
  return apiPost<ApiRoommateActionResponse>(`/roommates/${encodeURIComponent(id)}/actions`, { action }, token);
}

export async function undoRoommateAction(token: string) {
  try {
    return await apiPost<{ roommateProfileId: string; action: RoommateAction }>("/roommates/actions/undo", {}, token);
  } catch (caught) {
    // The API client keeps only error codes, so the server's 409 reasons are summed up here.
    if (caught instanceof ProductApiError && caught.status === 409) throw new Error("只能撤回 10 分钟内、还没配对的操作。");
    throw caught;
  }
}

export async function getMyRoommateProfile(token: string) {
  return (await apiGet<{ profile: MyRoommateProfile | null }>("/roommate-profiles/me", token)).profile;
}

/** Creates the profile when there is no id yet. The display name goes first so the public card is built with it. */
export async function saveMyRoommateProfile(token: string, id: string | null, input: RoommateProfileInput, displayName?: string | null) {
  if (displayName !== undefined) await updateMyProfile(token, { displayName });
  return id
    ? apiPatch<{ id: string }>(`/roommate-profiles/${encodeURIComponent(id)}`, input, token)
    : apiPost<{ id: string }>("/roommate-profiles", input, token);
}
