import type { RoommateActionType, RoommateMatchingProfile, RoommateProfile } from "@prisma/client";

import { RoommateField, roommateCode, roommateCodes, roommateLabel } from "./roommate-values";

export type RoommateCardRow = RoommateProfile & { matchingProfile: RoommateMatchingProfile | null };
type RoommateFeatureKey =
  "dates" | "budget" | "area" | "school" | "roomType" | "sleep" | "clean" | "guests" | "smoking" | "pets" | "age";
type RoommateViewerField =
  "age" | "gender" | "dates" | "budget" | "city" | "neighborhoods" | "roomType" | "sleepSchedule" | "cleanliness";

type RoommateCard = {
  id: string; name: string; age: number; image: string;
  school: string | null; city: string | null; neighborhoods: string[];
  budgetMin: number | null; budgetMax: number | null;
  moveInDate: string | null; moveOutDate: string | null;
  roomType: string | null; gender: string | null;
  sleepSchedule: string | null; cleanliness: string | null; guests: string | null; smoking: string | null; pets: string | null;
  intro: string | null; lookingFor: string | null;
  /** null without a viewer profile, or when a hard filter blocks the pair (watchouts then say why). */
  score: number | null; tier: "great" | "good" | "fair" | null;
  reasons: string[]; watchouts: string[]; icebreaker: string | null;
  breakdown: Array<{ key: RoommateFeatureKey; label: string; score: number }>;
  likedYou: boolean; youLiked: boolean; later: boolean; conversationId: string | null;
};

type RoommateDeckResponse = {
  items: RoommateCard[];
  total: number;
  filteredOut: number;
  viewer: { signedIn: boolean; hasProfile: boolean; missing: RoommateViewerField[] };
};

export type RoommateDeckContext = {
  now: Date;
  userId: string | null;
  /** The viewer's own card. */
  viewer: RoommateCardRow | null;
  /** Every action the viewer has taken. */
  actions: Array<{ roommateProfileId: string; action: RoommateActionType; updatedAt: Date }>;
  /** Users who LIKEd the viewer's card. */
  likedBy: ReadonlySet<string>;
  /** Card id → LIKEs received in the last `inboundLikeDays`. */
  inboundLikes: ReadonlyMap<string, number>;
  /** User id → their latest action within `lookbackDays`. */
  lastActionAt: ReadonlyMap<string, Date>;
  /** The viewer's LIKE/PASS actions within `lookbackDays`, newest first. */
  history: Array<{ action: RoommateActionType; roommateProfile: RoommateCardRow }>;
};

export const lookbackDays = 120;
export const inboundLikeDays = 14;
const passCooldownDays = 21;
const mmrPoolSize = 60;
const day = 86_400_000;

type MatchProfile = ReturnType<typeof toMatchProfile>;
type Sim = number | null;
type Conflict = { key: string; text: string };
type DeckEntry = {
  row: RoommateCardRow;
  candidate: MatchProfile;
  ab: Sim[] | null;
  ba: Sim[] | null;
  rank: number;
  likedYou: boolean;
  later: boolean;
};
type Feature = {
  key: RoommateFeatureKey;
  label: string;
  weight: number;
  /** How well b fits a, in [0, 1]; null when either side is unknown. */
  sim(a: MatchProfile, b: MatchProfile): Sim;
  /** Learning buckets for a candidate's value. */
  buckets?(b: MatchProfile): string[];
  reason(v: MatchProfile, c: MatchProfile): string | null;
  watchout?(v: MatchProfile, c: MatchProfile): string;
  question?(c: MatchProfile): string | null;
};

const cityAliases: Record<string, string> = { la: "los angeles", sf: "san francisco", nyc: "new york" };
const roomTypeSims: Record<string, number> = { "entire_place|private_room": 0.6, "entire_place|shared_room": 0.5, "private_room|shared_room": 0.2 };
const sleepPhrases = ["早睡早起", "作息规律", "是夜猫子"];
const smokingLevels = ["no", "outside", "yes"];
const dealbreakerFeature: Record<string, RoommateFeatureKey> = { smoking: "smoking", pets: "pets", night_owl: "sleep", frequent_guests: "guests" };

const features: Feature[] = [
  {
    key: "dates", label: "入住时间", weight: 3,
    sim(a, b) {
      const [sa, sb] = [stay(a), stay(b)];
      if (!sa || !sb) return null;
      return 0.75 * overlapDays(sa, sb) / Math.max(1, (sa[1] - sa[0]) / day) +
        0.25 * Math.max(0, 1 - Math.abs(sa[0] - sb[0]) / day / 60);
    },
    reason(v, c) {
      if (!v.moveOut && !c.moveOut) return "入住时间相近，都没定搬走日期";
      const days = overlapDays(stay(v)!, stay(c)!);
      return days < 60 ? `入住时间重合 ${days} 天` : `入住时间重合约 ${Math.round(days / 30)} 个月`;
    },
    watchout: datesWatchout,
    question: () => "入住和搬走的日期能调整吗？"
  },
  {
    key: "budget", label: "预算", weight: 3,
    sim(a, b) {
      const [ra, rb] = [budgetRange(a), budgetRange(b)];
      if (!ra || !rb) return null;
      const gap = Math.max(ra[0], rb[0]) - Math.min(ra[1], rb[1]);
      if (gap > 100) return Math.max(0, 0.4 - (gap - 100) / (0.5 * ra[1]));
      // Ranges padded by $50 each side, measured against the narrower range so containment is a full fit.
      const width = Math.max(100, Math.min(ra[1] - ra[0], rb[1] - rb[0]));
      return Math.max(0.4, Math.min(1, (100 - gap) / width));
    },
    reason(v, c) {
      const [low, high] = budgetOverlap(v, c);
      return low <= high ? `预算区间重合 ${usdRange(low, high)}` : `预算只差 ${usd(low - high)}`;
    },
    watchout(v, c) {
      const [low, high] = budgetOverlap(v, c);
      return low <= high ? `预算只重合 ${usdRange(low, high)}` : `预算差距约 ${usd(Math.ceil((low - high) / 10) * 10)}`;
    },
    question: () => "每月房租最多能接受多少？"
  },
  {
    key: "area", label: "区域", weight: 2,
    sim: (a, b) => (a.hoodKeys.length && b.hoodKeys.length ? sharedHoods(a, b).length / a.hoodKeys.length : null),
    buckets: (b) => b.hoodKeys.map((hood) => `area:${hood}`),
    reason: (v, c) => `都考虑 ${sharedHoods(v, c).slice(0, 2).join("、")}`,
    watchout(v, c) {
      const shared = sharedHoods(v, c);
      return shared.length ? `想住的区域只重合 ${shared.slice(0, 2).join("、")}` : "想住的区域没有重合";
    },
    question: () => "最想住哪个区？"
  },
  {
    key: "school", label: "学校", weight: 1.5,
    sim: (a, b) => (a.schoolKey && b.schoolKey ? (a.schoolKey === b.schoolKey ? 1 : 0.35) : null),
    buckets: (b) => (b.schoolKey ? [`school:${b.schoolKey}`] : []),
    reason: (v) => `都在 ${v.school}`,
    question: (c) => (c.school ? `在 ${c.school} 读什么专业？` : null)
  },
  {
    key: "roomType", label: "房型", weight: 1,
    sim: (a, b) =>
      a.roomType && b.roomType
        ? a.roomType === b.roomType ? 1 : roomTypeSims[[a.roomType, b.roomType].sort().join("|")]
        : null,
    buckets: (b) => (b.roomType ? [`roomType:${b.roomType}`] : []),
    reason: (v) => `都想找${roommateLabel("roomType", v.roomType)}`,
    watchout: (_v, c) => `TA 想找${roommateLabel("roomType", c.roomType)}`,
    question: () => "想找什么样的房型？"
  },
  {
    key: "sleep", label: "作息", weight: 1.5,
    sim: (a, b) => (a.sleep !== null && b.sleep !== null ? 1 - Math.abs(a.sleep - b.sleep) / 2 : null),
    buckets: (b) => (b.sleep !== null ? [`sleep:${b.sleep}`] : []),
    reason: (v) => ["都习惯早睡早起", "作息都比较规律", "都是夜猫子"][v.sleep!],
    watchout: (v, c) => `作息不同：你${sleepPhrases[v.sleep!]}，TA ${sleepPhrases[c.sleep!]}`,
    question: () => "平时几点睡、几点起？"
  },
  {
    key: "clean", label: "整洁", weight: 2,
    sim(a, b) {
      if (a.clean === null || b.clean === null) return null;
      const messier = a.clean - b.clean;
      return messier > 0 ? 1 - messier / 2 : 1 + messier / 4;
    },
    buckets: (b) => (b.clean !== null ? [`clean:${b.clean}`] : []),
    reason: (v) => ["对整洁的要求相近", "都喜欢整洁", "都很爱干净"][v.clean!],
    watchout: (v, c) => `TA 对整洁的要求比你${c.clean! < v.clean! ? "低" : "高"}`,
    question: () => "公共区域多久打扫一次？"
  },
  {
    key: "guests", label: "访客", weight: 1,
    sim(a, b) {
      if (a.guests === null || b.guests === null) return null;
      const more = b.guests - a.guests;
      return more > 0 ? 1 - more / 2 : 1 + more / 4;
    },
    buckets: (b) => (b.guests !== null ? [`guests:${b.guests}`] : []),
    reason: () => "带朋友回家的频率相近",
    watchout: (v, c) => (c.guests! > v.guests! ? "TA 带朋友回家比你频繁" : "你带朋友回家比 TA 频繁"),
    question: () => "朋友来过夜可以接受吗？"
  },
  {
    key: "smoking", label: "吸烟", weight: 1,
    sim(a, b) {
      if (b.smoking === "outside" && a.dealbreakers.includes("smoking")) return 0.3;
      if (!a.smoking || !b.smoking) return null;
      if (b.smoking === "no") return 1;
      if (b.smoking === "outside") return a.smoking === "no" ? 0.6 : 0.9;
      return a.smoking === "yes" ? 0.9 : 0.1;
    },
    buckets: (b) => (b.smoking ? [`smoking:${b.smoking}`] : []),
    reason: (v, c) => (v.smoking === "no" && c.smoking === "no" ? "都不抽烟" : null),
    // Names the viewer too when the viewer is the one who smokes more.
    watchout: (v, c) => (smokingLevels.indexOf(v.smoking!) > smokingLevels.indexOf(c.smoking!) ? `你${smokes(v)}，TA ${smokes(c)}` : `TA ${smokes(c)}`),
    question: () => "介意室内有烟味吗？"
  },
  {
    key: "pets", label: "宠物", weight: 1,
    sim: (a, b) => (a.pets && b.pets ? (b.pets === "has_pet" && a.pets === "none" ? 0.6 : 1) : null),
    buckets: (b) => (b.pets ? [`pets:${b.pets}`] : []),
    reason: (v) => (v.pets === "none" ? "都没有养宠物" : "都养宠物"),
    question: (c) => (c.pets === "has_pet" ? "养的是什么宠物？" : "能接受室友养宠物吗？")
  },
  {
    key: "age", label: "年龄", weight: 0.5,
    sim: (a, b) => Math.exp(-Math.max(0, Math.abs(a.age - b.age) - 3) / 5),
    reason: (v, c) => `年龄相差不到 ${Math.abs(v.age - c.age) + 1} 岁`
  }
];
const totalWeight = features.reduce((sum, feature) => sum + feature.weight, 0);

export function toPublicRoommate<T extends object>(
  roommate: T
): Omit<T, "ownerId" | "localReciprocalLike" | "matchingProfileId"> {
  const { ownerId: _ownerId, localReciprocalLike: _local, matchingProfileId: _matching, ...publicRoommate } =
    roommate as T & { ownerId?: unknown; localReciprocalLike?: unknown; matchingProfileId?: unknown };
  return publicRoommate as Omit<T, "ownerId" | "localReciprocalLike" | "matchingProfileId">;
}

export function dateOnly(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function buildRoommateDeck(rows: RoommateCardRow[], context: RoommateDeckContext, limit: number): RoommateDeckResponse {
  const viewer = context.viewer?.matchingProfile ? toMatchProfile(context.viewer) : null;
  const swipes = swipeStates(context);
  const learned = viewer ? learnFromHistory(context.history) : null;
  const viewerKey = context.userId ?? "guest";
  const today = context.now.toISOString().slice(0, 10);
  let filteredOut = 0;
  const eligible = rows.flatMap((row): DeckEntry[] => {
    const swipe = swipes.get(row.id);
    if ((context.userId && row.ownerId === context.userId) || swipe === "liked" || swipe === "passed") return [];
    const candidate = toMatchProfile(row);
    if (viewer ? conflicts(viewer, candidate).length > 0 : candidate.genderPreference !== "any") {
      if (viewer) filteredOut += 1;
      return [];
    }
    const ab = viewer && sims(viewer, candidate);
    const ba = viewer && sims(candidate, viewer);
    let fit: number | null = null;
    let rankFit = 0.5;
    if (ab && ba) {
      fit = harmonic(score(ab), score(ba));
      rankFit = learned ? harmonic(score(learned(ab, candidate)), score(ba)) : fit;
    }
    const likedYou = Boolean(row.ownerId && context.likedBy.has(row.ownerId));
    const lastAction = row.ownerId ? context.lastActionAt.get(row.ownerId)?.getTime() ?? 0 : 0;
    const inactiveDays = daysSince(Math.max(candidate.updatedAt.getTime(), lastAction), context.now);
    const ageDays = daysSince(candidate.createdAt.getTime(), context.now);
    const rank =
      rankFit *
      (0.85 + 0.15 * completeness(candidate)) *
      (0.7 + 0.3 * Math.exp(-inactiveDays / 14)) *
      (1 / (1 + 0.05 * Math.max(0, (context.inboundLikes.get(row.id) ?? 0) - 6))) *
      (ageDays < 7 ? 1 + 0.1 * Math.exp(-ageDays / 3) : 1) *
      (likedYou && fit !== null && fit >= 0.5 ? 1.12 : 1) *
      (swipe === "resurfaced" ? 0.85 : 1) +
      0.03 * (hashUnit(`${viewerKey}|${row.id}|${today}`) - 0.5);
    return [{ row, candidate, ab, ba, rank, likedYou, later: swipe === "later" }];
  });
  const byRank = (a: DeckEntry, b: DeckEntry) => b.rank - a.rank || (a.row.id < b.row.id ? -1 : 1);
  const ordered = [
    ...diversify(eligible.filter((entry) => !entry.later).sort(byRank)),
    ...eligible.filter((entry) => entry.later).sort(byRank)
  ];

  return {
    items: ordered.slice(0, limit).map((entry) =>
      toCard(entry.row, entry.candidate, viewer && describe(viewer, entry.candidate, entry.ab!, entry.ba!, []), {
        likedYou: entry.likedYou,
        youLiked: false,
        later: entry.later,
        conversationId: null
      })
    ),
    total: eligible.length,
    filteredOut,
    viewer: { signedIn: context.userId !== null, hasProfile: viewer !== null, missing: missingFields(viewer) }
  };
}

/** One card regardless of swipe state, with hard-filter conflicts listed first among the watchouts. */
export function buildRoommateCard(
  row: RoommateCardRow,
  viewerRow: RoommateCardRow | null,
  flags: Pick<RoommateCard, "likedYou" | "youLiked" | "conversationId">
): RoommateCard {
  const viewer = viewerRow?.matchingProfile ? toMatchProfile(viewerRow) : null;
  const candidate = toMatchProfile(row);
  const fit = viewer && describe(viewer, candidate, sims(viewer, candidate), sims(candidate, viewer), conflicts(viewer, candidate));
  return toCard(row, candidate, fit, { ...flags, later: false });
}

function toMatchProfile(row: RoommateCardRow) {
  const m = row.matchingProfile;
  const neighborhoods = [...new Map((m?.preferredNeighborhoods ?? []).filter((hood) => hood.trim()).map((hood) => [textKey(hood), hood.trim()])).values()];
  const school = m?.school?.trim() || null;
  const city = m?.city?.trim() || null;
  return {
    age: row.age,
    gender: roommateCode("gender", m?.gender),
    genderPreference: roommateCode("genderPreference", m?.genderPreference) ?? "any",
    city,
    cityKey: city && (cityAliases[textKey(city)] ?? textKey(city)),
    school,
    schoolKey: school && textKey(school),
    neighborhoods,
    hoodKeys: neighborhoods.map(textKey),
    budgetMin: m?.budgetMin ?? null,
    budgetMax: m?.budgetMax ?? null,
    moveIn: m?.moveInDate ?? null,
    moveOut: m?.moveOutDate ?? null,
    roomType: roommateCode("roomType", m?.roomType),
    sleep: level("sleepSchedule", m?.sleepSchedule),
    clean: level("cleanliness", m?.cleanliness),
    guests: level("guests", m?.guests),
    smoking: roommateCode("smoking", m?.smoking),
    pets: roommateCode("pets", m?.pets),
    dealbreakers: (m?.dealbreakers ?? []).filter((item) => roommateCode("dealbreakers", item)),
    intro: m?.intro?.trim() || null,
    lookingFor: m?.lookingFor?.trim() || null,
    hasPhoto: !row.image.includes("api.dicebear.com"),
    createdAt: row.createdAt,
    updatedAt: m?.updatedAt ?? row.createdAt
  };
}

function toCard(
  row: RoommateCardRow,
  p: MatchProfile,
  fit: ReturnType<typeof describe> | null,
  flags: Pick<RoommateCard, "likedYou" | "youLiked" | "later" | "conversationId">
): RoommateCard {
  return {
    id: row.id, name: row.name, age: row.age, image: row.image,
    school: p.school, city: p.city, neighborhoods: p.neighborhoods,
    budgetMin: p.budgetMin, budgetMax: p.budgetMax,
    moveInDate: dateOnly(p.moveIn), moveOutDate: dateOnly(p.moveOut),
    roomType: p.roomType, gender: p.gender,
    sleepSchedule: levelCode("sleepSchedule", p.sleep),
    cleanliness: levelCode("cleanliness", p.clean),
    guests: levelCode("guests", p.guests),
    smoking: p.smoking, pets: p.pets,
    intro: p.intro, lookingFor: p.lookingFor,
    ...(fit ?? { score: null, tier: null, reasons: [], watchouts: [], icebreaker: null, breakdown: [] }),
    ...flags
  };
}

function describe(v: MatchProfile, c: MatchProfile, ab: Sim[], ba: Sim[], hardConflicts: Conflict[]) {
  const fit = harmonic(score(ab), score(ba));
  const known = features.flatMap((feature, index) => {
    const [x, y] = [ab[index], ba[index]];
    return x !== null && y !== null ? [{ feature, low: Math.min(x, y) }] : [];
  });
  const reasons = known
    .filter((item) => item.low >= 0.75)
    .sort((a, b) => b.feature.weight * b.low - a.feature.weight * a.low)
    .flatMap(({ feature }) => {
      const text = feature.reason(v, c);
      return text ? [{ key: feature.key, text }] : [];
    })
    .slice(0, 3);
  const conflictKeys = new Set(hardConflicts.map((conflict) => conflict.key));
  const watchouts = [
    ...hardConflicts,
    ...known
      .filter((item) => item.low <= 0.4 && item.feature.watchout && !conflictKeys.has(item.feature.key))
      .sort((a, b) => a.low - b.low || b.feature.weight - a.feature.weight)
      .slice(0, 2)
      .map(({ feature }) => ({ key: feature.key, text: feature.watchout!(v, c) }))
  ];
  const focus = watchouts[0]?.key ?? reasons[0]?.key;
  const question = features.find((feature) => feature.key === focus)?.question?.(c);
  const percent = hardConflicts.length ? null : Math.round(100 * fit);

  return {
    score: percent,
    tier: percent === null ? null : percent >= 80 ? ("great" as const) : percent >= 65 ? ("good" as const) : ("fair" as const),
    reasons: reasons.map((reason) => reason.text),
    watchouts: watchouts.map((watchout) => watchout.text),
    icebreaker: `问问 TA：${question ?? "理想的室友是什么样的？"}`,
    // Only features both sides filled in; unknowns would all read as 50.
    breakdown: features.flatMap((feature, index) => {
      const [x, y] = [ab[index], ba[index]];
      return x !== null && y !== null ? [{ key: feature.key, label: feature.label, score: Math.round(100 * harmonic(x, y)) }] : [];
    })
  };
}

/** Hard filters in both directions; any entry makes the pair ineligible. */
function conflicts(v: MatchProfile, c: MatchProfile): Conflict[] {
  const found = [...requirementConflicts(v, c, "你"), ...requirementConflicts(c, v, "TA ")];
  if (v.cityKey && c.cityKey && v.cityKey !== c.cityKey) found.push({ key: "city", text: "不在同一城市" });
  const [sv, sc] = [stay(v), stay(c)];
  if (sv && sc) {
    const overlap = overlapDays(sv, sc);
    const shorter = Math.min(sv[1] - sv[0], sc[1] - sc[0]) / day;
    if (overlap <= 0 || overlap < Math.min(21, 0.5 * shorter)) {
      found.push({ key: "dates", text: overlap <= 0 ? "入住时间没有重合" : "入住时间重合不足 3 周" });
    }
  }
  const [rv, rc] = [budgetRange(v), budgetRange(c)];
  if (rv && rc) {
    const gap = Math.max(rv[0], rc[0]) - Math.min(rv[1], rc[1]);
    if (gap > 0.15 * Math.min(rv[1], rc[1])) found.push({ key: "budget", text: `预算差距约 ${usd(Math.ceil(gap / 10) * 10)}` });
  }
  return found;
}

/** a's gender preference and dealbreakers checked against b. */
function requirementConflicts(a: MatchProfile, b: MatchProfile, who: string): Conflict[] {
  const found: Conflict[] = [];
  if (a.genderPreference !== "any" && b.gender !== a.genderPreference) {
    found.push({ key: "gender", text: `${who}${roommateLabel("genderPreference", a.genderPreference)}室友` });
  }
  for (const item of a.dealbreakers) {
    const violated =
      (item === "smoking" && b.smoking === "yes") ||
      (item === "pets" && b.pets === "has_pet") ||
      (item === "night_owl" && b.sleep === 2) ||
      (item === "frequent_guests" && b.guests === 2);
    if (violated) found.push({ key: dealbreakerFeature[item], text: `${who}不接受${roommateLabel("dealbreakers", item)}` });
  }
  return found;
}

function sims(a: MatchProfile, b: MatchProfile) {
  return features.map((feature) => feature.sim(a, b));
}

function score(values: Sim[]) {
  return features.reduce((sum, feature, index) => sum + feature.weight * (values[index] ?? 0.5), 0) / totalWeight;
}

/** Blends viewer→candidate similarities toward what the viewer's LIKE/PASS history favours. */
function learnFromHistory(history: RoommateDeckContext["history"]) {
  const swipes = history.filter((item) => item.action !== "LATER");
  const lambda = Math.min(0.3, Math.max(0, (swipes.length - 10) / 100));
  if (lambda === 0) return null;
  const base = swipes.filter((item) => item.action === "LIKE").length / swipes.length;
  const counts = new Map<string, { likes: number; passes: number }>();
  for (const { action, roommateProfile } of swipes) {
    const target = toMatchProfile(roommateProfile);
    for (const bucket of features.flatMap((feature) => feature.buckets?.(target) ?? [])) {
      const count = counts.get(bucket) ?? { likes: 0, passes: 0 };
      count[action === "LIKE" ? "likes" : "passes"] += 1;
      counts.set(bucket, count);
    }
  }
  const affinity = (bucket: string) => {
    const { likes, passes } = counts.get(bucket) ?? { likes: 0, passes: 0 };
    const p = (likes + 4 * base) / (likes + passes + 4);
    return Math.min(1, Math.max(0, 0.5 + p - base));
  };

  return (values: Sim[], candidate: MatchProfile): Sim[] =>
    features.map((feature, index) => {
      const buckets = feature.buckets?.(candidate) ?? [];
      if (buckets.length === 0) return values[index];
      const aff = buckets.reduce((sum, bucket) => sum + affinity(bucket), 0) / buckets.length;
      return (1 - lambda) * (values[index] ?? 0.5) + lambda * aff;
    });
}

/** Maximal marginal relevance over the top of the deck so similar profiles do not cluster. */
function diversify(sorted: DeckEntry[]) {
  const pool = sorted.slice(0, mmrPoolSize).map((entry) => ({ entry, maxSimilarity: 0 }));
  const picked: DeckEntry[] = [];
  const value = (item: (typeof pool)[number]) => 0.8 * item.entry.rank - 0.2 * item.maxSimilarity;
  while (pool.length > 0) {
    const best = pool.reduce((bestIndex, item, index) => (value(item) > value(pool[bestIndex]) ? index : bestIndex), 0);
    const [{ entry }] = pool.splice(best, 1);
    picked.push(entry);
    for (const item of pool) item.maxSimilarity = Math.max(item.maxSimilarity, similarity(item.entry.candidate, entry.candidate));
  }
  return [...picked, ...sorted.slice(mmrPoolSize)];
}

function similarity(a: MatchProfile, b: MatchProfile) {
  const pairs = [
    [a.schoolKey, b.schoolKey],
    [a.hoodKeys[0], b.hoodKeys[0]],
    [a.sleep, b.sleep],
    [a.clean, b.clean],
    [a.roomType, b.roomType],
    [a.gender, b.gender]
  ];
  return pairs.filter(([x, y]) => x != null && x === y).length / pairs.length;
}

function swipeStates({ actions, now }: RoommateDeckContext) {
  const states = new Map<string, "liked" | "passed" | "resurfaced" | "later">();
  for (const { roommateProfileId, action, updatedAt } of actions) {
    states.set(
      roommateProfileId,
      action === "LIKE" ? "liked" : action === "LATER" ? "later" : daysSince(updatedAt.getTime(), now) < passCooldownDays ? "passed" : "resurfaced"
    );
  }
  return states;
}

/** Share of the 13 key fields (photo included) the candidate has filled in. */
function completeness(p: MatchProfile) {
  const known = [
    p.gender, p.school, budgetRange(p), p.moveIn, p.neighborhoods[0], p.roomType,
    p.sleep, p.clean, p.guests, p.smoking, p.pets, p.intro, p.hasPhoto || null
  ];
  return known.filter((value) => value != null).length / known.length;
}

function missingFields(v: MatchProfile | null): RoommateViewerField[] {
  const known: Record<RoommateViewerField, unknown> = {
    age: v,
    gender: v?.gender,
    dates: v?.moveIn,
    budget: v && budgetRange(v),
    city: v?.city,
    neighborhoods: v?.neighborhoods[0],
    roomType: v?.roomType,
    sleepSchedule: v?.sleep,
    cleanliness: v?.clean
  };
  return (Object.keys(known) as RoommateViewerField[]).filter((field) => known[field] == null);
}

function datesWatchout(v: MatchProfile, c: MatchProfile) {
  const [sv, sc] = [stay(v)!, stay(c)!];
  const startGap = Math.round((sc[0] - sv[0]) / day);
  const endGap = v.moveOut || c.moveOut ? Math.round((sc[1] - sv[1]) / day) : 0;
  if (startGap === 0 && endGap === 0) return `入住时间只重合 ${overlapDays(sv, sc)} 天`;
  if (Math.abs(startGap) >= Math.abs(endGap)) {
    return `TA ${monthDay(c.moveIn!)} ${startGap > 0 ? "才入住，比你晚" : "就入住，比你早"} ${Math.abs(startGap)} 天`;
  }
  // An open end has no date to compare, so only the fixed one is named.
  if (!v.moveOut) return `TA ${monthDay(c.moveOut!)} 就搬走`;
  if (!c.moveOut) return `你 ${monthDay(v.moveOut)} 就搬走，TA 没定搬走日期`;
  return `TA ${monthDay(c.moveOut)} ${endGap < 0 ? "就搬走，比你早" : "才搬走，比你晚"} ${Math.abs(endGap)} 天`;
}

/** Open-ended stays count as one year from move-in. */
function stay(p: MatchProfile): [number, number] | null {
  if (!p.moveIn) return null;
  const start = p.moveIn.getTime();
  return [start, p.moveOut ? p.moveOut.getTime() : start + 365 * day];
}

function overlapDays(a: [number, number], b: [number, number]) {
  return Math.max(0, Math.round((Math.min(a[1], b[1]) - Math.max(a[0], b[0])) / day));
}

/** A missing bound is filled from the other one; a lone $0 bound says nothing, so it counts as unknown. */
function budgetRange({ budgetMin: min, budgetMax: max }: MatchProfile): [number, number] | null {
  if (max) return [min ?? Math.round(max * 0.75), max];
  return min ? [min, Math.round(min * 1.3)] : null;
}

function budgetOverlap(a: MatchProfile, b: MatchProfile) {
  const [ra, rb] = [budgetRange(a)!, budgetRange(b)!];
  return [Math.max(ra[0], rb[0]), Math.min(ra[1], rb[1])];
}

function sharedHoods(a: MatchProfile, b: MatchProfile) {
  return a.neighborhoods.filter((_hood, index) => b.hoodKeys.includes(a.hoodKeys[index]));
}

function level(field: RoommateField, value: string | null | undefined) {
  const code = roommateCode(field, value);
  return code === null ? null : roommateCodes(field).indexOf(code);
}

function levelCode(field: RoommateField, value: number | null) {
  return value === null ? null : roommateCodes(field)[value];
}

function textKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function harmonic(a: number, b: number) {
  return a + b > 0 ? (2 * a * b) / (a + b) : 0;
}

function daysSince(time: number, now: Date) {
  return Math.max(0, (now.getTime() - time) / day);
}

/** FNV-1a, mapped to [0, 1). */
function hashUnit(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

function smokes(p: MatchProfile) {
  return p.smoking === "yes" ? "抽烟" : p.smoking === "outside" ? "只在室外抽烟" : "不抽烟";
}

function monthDay(date: Date) {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function usd(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function usdRange(low: number, high: number) {
  return low === high ? usd(low) : `${usd(low)}–${usd(high)}`;
}
