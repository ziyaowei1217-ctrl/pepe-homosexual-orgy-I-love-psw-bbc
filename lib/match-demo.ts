export type DemoRoommate = {
  id?: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  origin?: string;
  tags: string[];
};

export type DemoListing = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
};

export type MatchMetric = {
  label: "Budget overlap" | "Commute overlap" | "Lifestyle compatibility" | "Trust status";
  score: number;
  detail: string;
  tone: "budget" | "commute" | "lifestyle" | "trust";
};

export type MatchFit = {
  overall: number;
  sharedBudgetLabel: string;
  targetBudgetLabel: string;
  metrics: MatchMetric[];
  sharedTags: string[];
};

export type RecommendedListing = DemoListing & {
  fitScore: number;
  fitLabel: "Best match" | "Strong fit" | "Worth comparing";
  perPersonPrice: number;
};

export type DealRoomMessage = {
  author: string;
  body: string;
  time: string;
  align: "left" | "right";
};

export type DealPipelineStep = {
  label: "Match" | "Shortlist" | "Tour" | "Apply";
  status: "active" | "ready" | "idle";
  detail: string;
};

export type DealRoom = {
  members: DemoRoommate[];
  matchFit: MatchFit;
  recommendedHomes: RecommendedListing[];
  messages: DealRoomMessage[];
  pipeline: DealPipelineStep[];
  trustChecklist: Array<{ label: string; detail: string; complete: boolean }>;
  canRequestTour: boolean;
  mapFocusLabel: string;
  primaryCta: "Request group tour" | "Like to unlock group tour";
};

export type BuildDealRoomOptions = {
  readyForTour?: boolean;
  viewerName?: string;
};

const currency = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "USD"
});

const trustWords = ["verified", "认证", "房东知情", "视频", "保障", "landlord"];

export function getBudgetNumber(roommate: Pick<DemoRoommate, "budget">) {
  const parsed = Number(roommate.budget.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildMatchFit(
  roommate: DemoRoommate,
  listings: DemoListing[],
  groupMembers: DemoRoommate[]
): MatchFit {
  const allMembers = mergeMembers(groupMembers, roommate);
  const budgets = allMembers.map(getBudgetNumber).filter((budget) => budget > 0);
  const minBudget = budgets.length > 0 ? Math.min(...budgets) : 0;
  const maxBudget = budgets.length > 0 ? Math.max(...budgets) : 0;
  const targetBudget = budgets.length > 0 ? Math.round(average(budgets)) : 0;
  const sharedTags = getSharedTags(roommate, groupMembers);
  const recommended = recommendListingsForRoommate(roommate, listings, groupMembers);
  const hasTrustedHome = recommended.some((listing) => isTrustedListing(listing));

  return {
    overall: clampScore(roommate.match),
    sharedBudgetLabel:
      minBudget === maxBudget
        ? `${currency.format(minBudget)} / person`
        : `${currency.format(minBudget)} - ${currency.format(maxBudget)} / person`,
    targetBudgetLabel: `Target: ${currency.format(targetBudget || maxBudget || minBudget)}`,
    metrics: [
      {
        label: "Budget overlap",
        score: scoreBudgetOverlap(budgets, recommended[0]),
        detail:
          minBudget && maxBudget
            ? `${currency.format(minBudget)} - ${currency.format(maxBudget)}`
            : "Budget pending",
        tone: "budget"
      },
      {
        label: "Commute overlap",
        score: scoreTextOverlap(roommate.commute, groupMembers.map((member) => member.commute).join(" "), 88),
        detail: "Both prefer <= 30 min",
        tone: "commute"
      },
      {
        label: "Lifestyle compatibility",
        score: Math.max(84, Math.min(96, 82 + sharedTags.length * 4)),
        detail: sharedTags.length > 0 ? `${sharedTags.length} shared habits` : "Compatible habits",
        tone: "lifestyle"
      },
      {
        label: "Trust status",
        score: hasTrustedHome ? 91 : 84,
        detail: hasTrustedHome ? "Verified homes ready" : "Needs review",
        tone: "trust"
      }
    ],
    sharedTags
  };
}

export function recommendListingsForRoommate(
  roommate: DemoRoommate,
  listings: DemoListing[],
  groupMembers: DemoRoommate[]
): RecommendedListing[] {
  const members = mergeMembers(groupMembers, roommate);
  const budgets = members.map(getBudgetNumber).filter((budget) => budget > 0);
  const targetBudget = budgets.length > 0 ? average(budgets) : roommate.match * 20;

  return listings
    .map((listing) => {
      const perPersonPrice = getComparablePrice(listing, members.length, targetBudget);
      const budgetFit = Math.max(0, 40 - Math.abs(perPersonPrice - targetBudget) / 35);
      const groupFit = listing.beds >= Math.min(4, members.length) || listing.tags.some((tag) => tag.includes("Group")) ? 24 : 0;
      const trustFit = isTrustedListing(listing) ? 18 : 0;
      const commuteFit = scoreAreaOverlap(listing, members) / 8;
      const scoreFit = Math.max(0, Math.min(100, Math.round(budgetFit + groupFit + trustFit + commuteFit + listing.score * 2)));

      return {
        ...listing,
        perPersonPrice,
        fitScore: scoreFit,
        fitLabel: getFitLabel(scoreFit)
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore || a.price - b.price);
}

export function buildDealRoom(
  roommate: DemoRoommate,
  listings: DemoListing[],
  groupMembers: DemoRoommate[],
  options: BuildDealRoomOptions = {}
): DealRoom {
  const members = mergeMembers(groupMembers, roommate);
  const recommendedHomes = recommendListingsForRoommate(roommate, listings, groupMembers).slice(0, 3);
  const topHome = recommendedHomes[0];
  const canRequestTour = options.readyForTour ?? true;
  const roommateKey = roommate.id ?? roommate.name;
  const replyAuthor =
    groupMembers.find((member) => (member.id ?? member.name) !== roommateKey)?.name ?? options.viewerName ?? "You";
  const mapFocusLabel = topHome ? `${getAreaShortName(topHome.area)} focus` : "Shared commute focus";
  const groupTrustDetail = canRequestTour || members.length > 1 ? "Both verified" : "Profile verified";
  const backgroundDetail = canRequestTour || members.length > 1 ? "Both clear" : "Ready after match";

  return {
    members,
    matchFit: buildMatchFit(roommate, listings, groupMembers),
    recommendedHomes,
    canRequestTour,
    mapFocusLabel,
    messages: [
      {
        author: roommate.name,
        body: topHome
          ? `I love the ${getAreaShortName(topHome.area)} place too. Should we request a tour together?`
          : "This match feels practical. Should we compare homes together?",
        time: "10:24 AM",
        align: "left"
      },
      {
        author: replyAuthor,
        body: "Weekday evenings work for me. How about Tue or Wed?",
        time: "10:27 AM",
        align: "right"
      }
    ],
    pipeline: [
      { label: "Match", status: "active", detail: "You're here" },
      { label: "Shortlist", status: recommendedHomes.length > 0 ? "ready" : "idle", detail: `${recommendedHomes.length} homes` },
      { label: "Tour", status: canRequestTour ? "ready" : "idle", detail: canRequestTour ? "Ready to schedule" : "Like first" },
      { label: "Apply", status: "idle", detail: "Not started" }
    ],
    trustChecklist: [
      { label: "ID verified", detail: groupTrustDetail, complete: true },
      { label: "University verified", detail: groupTrustDetail, complete: true },
      { label: "Background check", detail: backgroundDetail, complete: true },
      { label: "Payment history", detail: "On track", complete: true },
      { label: "References", detail: `${Math.max(2, members.length)} shared`, complete: true }
    ],
    primaryCta: canRequestTour ? "Request group tour" : "Like to unlock group tour"
  };
}

function mergeMembers(groupMembers: DemoRoommate[], roommate: DemoRoommate) {
  const seen = new Set<string>();
  return [...groupMembers, roommate].filter((member) => {
    const key = member.id ?? member.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSharedTags(roommate: DemoRoommate, groupMembers: DemoRoommate[]) {
  const roommateTags = new Set(roommate.tags.map(normalizeText));
  const shared = groupMembers.flatMap((member) =>
    member.tags.filter((tag) => roommateTags.has(normalizeText(tag)))
  );

  return Array.from(new Set(shared)).slice(0, 5);
}

function getComparablePrice(listing: DemoListing, memberCount: number, targetBudget: number) {
  const looksLikeWholeHomePrice = listing.beds > 1 && targetBudget > 0 && listing.price > targetBudget * 1.45;
  if (!looksLikeWholeHomePrice) return listing.price;

  const divisor = Math.max(1, Math.min(memberCount, listing.beds));
  return Math.round(listing.price / divisor);
}

function isTrustedListing(listing: DemoListing) {
  const text = normalizeText(`${listing.trust} ${listing.tags.join(" ")}`);
  return trustWords.some((word) => text.includes(normalizeText(word)));
}

function scoreBudgetOverlap(budgets: number[], listing?: RecommendedListing) {
  if (budgets.length === 0 || !listing) return 84;
  const target = average(budgets);
  const delta = Math.abs(listing.perPersonPrice - target);
  return clampScore(96 - delta / 25);
}

function scoreTextOverlap(primary: string, secondary: string, fallback: number) {
  if (!primary || !secondary) return fallback;
  const primaryTokens = getTokens(primary);
  const secondaryTokens = new Set(getTokens(secondary));
  const overlap = primaryTokens.filter((token) => secondaryTokens.has(token)).length;
  return clampScore(fallback + overlap * 4);
}

function scoreAreaOverlap(listing: DemoListing, members: DemoRoommate[]) {
  const listingTokens = new Set(getTokens(`${listing.area} ${listing.commute} ${listing.transit}`));
  return members.reduce((sum, member) => {
    const hasOverlap = getTokens(member.commute).some((token) => listingTokens.has(token));
    return sum + (hasOverlap ? 12 : 4);
  }, 0);
}

function getFitLabel(score: number): RecommendedListing["fitLabel"] {
  if (score >= 70) return "Best match";
  if (score >= 50) return "Strong fit";
  return "Worth comparing";
}

function getAreaShortName(area: string) {
  const parts = area.split(/[-·]/).map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? area;
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function getTokens(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter((token) => token.length >= 2);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
