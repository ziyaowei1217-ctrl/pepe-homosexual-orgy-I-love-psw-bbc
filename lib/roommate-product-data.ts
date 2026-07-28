export type RoommateIdentity = {
  id?: string;
  name: string;
};

export function getRoommateStateKey(roommate: RoommateIdentity) {
  const id = roommate.id?.trim();
  return id || `name:${roommate.name.trim()}`;
}

export function getThreadParticipantNames(roommates: readonly RoommateIdentity[]) {
  return Array.from(
    new Set(
      [...roommates.map((roommate) => roommate.name), "我"]
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
}

export function selectSingleDealRoom<T>(dealRooms: readonly T[]) {
  return dealRooms.length === 1 ? dealRooms[0] : null;
}

export function hasCompleteRoommateGenderData(
  roommates: ReadonlyArray<{ gender?: string }>
) {
  return (
    roommates.length > 0 &&
    roommates.every(
      (roommate) =>
        typeof roommate.gender === "string" &&
        roommate.gender.trim().length > 0
    )
  );
}
