export type RoommateConnectionStatus =
  | "new"
  | "liked-by-me"
  | "liked-you"
  | "intro-sent"
  | "mutual"
  | "roommate";

export type RoommateIdCollection = ReadonlySet<string> | readonly string[];

export type RoommateConnectionState = {
  likedByMeIds: RoommateIdCollection;
  likedMeIds: RoommateIdCollection;
  introSentIds: RoommateIdCollection;
  roommateIds: RoommateIdCollection;
};

export type RoommateMatchStorageStateInput = Pick<
  RoommateConnectionState,
  "likedByMeIds" | "introSentIds" | "roommateIds"
>;

export function getRoommateMatchStateAfterLike(
  roommateId: string,
  state: RoommateMatchStorageStateInput
) {
  return {
    likedByMeIds: Array.from(new Set([...toIds(state.likedByMeIds), roommateId])),
    introSentIds: toIds(state.introSentIds),
    roommateMemberIds: toIds(state.roommateIds)
  };
}

export function getRoommateConnectionStatus(roommateId: string, state: RoommateConnectionState): RoommateConnectionStatus {
  const likedByMe = hasId(state.likedByMeIds, roommateId);
  const likedMe = hasId(state.likedMeIds, roommateId);

  if (hasId(state.roommateIds, roommateId)) return "roommate";
  if (likedByMe && likedMe) return "mutual";
  if (hasId(state.introSentIds, roommateId)) return "intro-sent";
  if (likedByMe) return "liked-by-me";
  if (likedMe) return "liked-you";
  return "new";
}

export function canSendRoommateIntro(roommateId: string, state: RoommateConnectionState) {
  const status = getRoommateConnectionStatus(roommateId, state);
  return status === "new" || status === "liked-by-me" || status === "liked-you";
}

export function canOpenRoommateDm(roommateId: string, state: RoommateConnectionState) {
  const status = getRoommateConnectionStatus(roommateId, state);
  return status === "mutual" || status === "roommate";
}

export function getAccessibleRoommateDmId(roommateId: string | null, state: RoommateConnectionState) {
  return roommateId && canOpenRoommateDm(roommateId, state) ? roommateId : null;
}

export function canRequestRoommateGroupTour(roommateId: string, state: RoommateConnectionState) {
  return getRoommateConnectionStatus(roommateId, state) === "roommate";
}

function hasId(collection: RoommateIdCollection, id: string) {
  return "has" in collection ? collection.has(id) : collection.includes(id);
}

function toIds(collection: RoommateIdCollection) {
  return "has" in collection ? Array.from(collection) : [...collection];
}
