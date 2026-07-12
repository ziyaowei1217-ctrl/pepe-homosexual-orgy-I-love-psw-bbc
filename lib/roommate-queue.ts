type RoommateQueueState = {
  likedByMeIds: readonly string[] | ReadonlySet<string>;
  likedMeIds: readonly string[] | ReadonlySet<string>;
  roommateIds: readonly string[] | ReadonlySet<string>;
};

export function classifyRoommateQueue<T>(
  candidates: T[],
  getId: (candidate: T) => string,
  state: RoommateQueueState
) {
  const likedByMe = toSet(state.likedByMeIds);
  const likedMe = toSet(state.likedMeIds);
  const roommateIds = toSet(state.roommateIds);

  return {
    waiting: candidates.filter((candidate) => {
      const id = getId(candidate);
      return likedByMe.has(id) && !likedMe.has(id) && !roommateIds.has(id);
    }),
    mutual: candidates.filter((candidate) => {
      const id = getId(candidate);
      return likedByMe.has(id) && likedMe.has(id) && !roommateIds.has(id);
    }),
    roommates: candidates.filter((candidate) => roommateIds.has(getId(candidate)))
  };
}

function toSet(collection: readonly string[] | ReadonlySet<string>) {
  return "has" in collection ? collection : new Set(collection);
}
