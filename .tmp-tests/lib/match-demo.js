"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBudgetNumber = getBudgetNumber;
exports.buildMatchFit = buildMatchFit;
exports.recommendListingsForRoommate = recommendListingsForRoommate;
exports.buildDealRoom = buildDealRoom;
const currency = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD"
});
const trustWords = ["verified", "认证", "房东知情", "视频", "保障", "landlord"];
function getBudgetNumber(roommate) {
    const parsed = Number(roommate.budget.replace(/[^0-9]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}
function buildMatchFit(roommate, listings, groupMembers) {
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
        sharedBudgetLabel: minBudget === maxBudget
            ? `${currency.format(minBudget)} / person`
            : `${currency.format(minBudget)} - ${currency.format(maxBudget)} / person`,
        targetBudgetLabel: `Target: ${currency.format(targetBudget || maxBudget || minBudget)}`,
        metrics: [
            {
                label: "Budget overlap",
                score: scoreBudgetOverlap(budgets, recommended[0]),
                detail: minBudget && maxBudget
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
function recommendListingsForRoommate(roommate, listings, groupMembers) {
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
function buildDealRoom(roommate, listings, groupMembers) {
    const members = mergeMembers(groupMembers, roommate);
    const recommendedHomes = recommendListingsForRoommate(roommate, listings, groupMembers).slice(0, 3);
    const topHome = recommendedHomes[0];
    return {
        members,
        matchFit: buildMatchFit(roommate, listings, groupMembers),
        recommendedHomes,
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
                author: "Alex",
                body: "Weekday evenings work for me. How about Tue or Wed?",
                time: "10:27 AM",
                align: "right"
            }
        ],
        pipeline: [
            { label: "Match", status: "active", detail: "You're here" },
            { label: "Shortlist", status: recommendedHomes.length > 0 ? "ready" : "idle", detail: `${recommendedHomes.length} homes` },
            { label: "Tour", status: "idle", detail: "Not scheduled" },
            { label: "Apply", status: "idle", detail: "Not started" }
        ],
        trustChecklist: [
            { label: "ID verified", detail: "Both verified", complete: true },
            { label: "University verified", detail: "Both verified", complete: true },
            { label: "Background check", detail: "Both clear", complete: true },
            { label: "Payment history", detail: "On track", complete: true },
            { label: "References", detail: `${Math.max(2, members.length)} shared`, complete: true }
        ],
        primaryCta: "Request group tour"
    };
}
function mergeMembers(groupMembers, roommate) {
    const seen = new Set();
    return [...groupMembers, roommate].filter((member) => {
        const key = member.id ?? member.name;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function getSharedTags(roommate, groupMembers) {
    const roommateTags = new Set(roommate.tags.map(normalizeText));
    const shared = groupMembers.flatMap((member) => member.tags.filter((tag) => roommateTags.has(normalizeText(tag))));
    return Array.from(new Set(shared)).slice(0, 5);
}
function getComparablePrice(listing, memberCount, targetBudget) {
    const looksLikeWholeHomePrice = listing.beds > 1 && targetBudget > 0 && listing.price > targetBudget * 1.45;
    if (!looksLikeWholeHomePrice)
        return listing.price;
    const divisor = Math.max(1, Math.min(memberCount, listing.beds));
    return Math.round(listing.price / divisor);
}
function isTrustedListing(listing) {
    const text = normalizeText(`${listing.trust} ${listing.tags.join(" ")}`);
    return trustWords.some((word) => text.includes(normalizeText(word)));
}
function scoreBudgetOverlap(budgets, listing) {
    if (budgets.length === 0 || !listing)
        return 84;
    const target = average(budgets);
    const delta = Math.abs(listing.perPersonPrice - target);
    return clampScore(96 - delta / 25);
}
function scoreTextOverlap(primary, secondary, fallback) {
    if (!primary || !secondary)
        return fallback;
    const primaryTokens = getTokens(primary);
    const secondaryTokens = new Set(getTokens(secondary));
    const overlap = primaryTokens.filter((token) => secondaryTokens.has(token)).length;
    return clampScore(fallback + overlap * 4);
}
function scoreAreaOverlap(listing, members) {
    const listingTokens = new Set(getTokens(`${listing.area} ${listing.commute} ${listing.transit}`));
    return members.reduce((sum, member) => {
        const hasOverlap = getTokens(member.commute).some((token) => listingTokens.has(token));
        return sum + (hasOverlap ? 12 : 4);
    }, 0);
}
function getFitLabel(score) {
    if (score >= 70)
        return "Best match";
    if (score >= 50)
        return "Strong fit";
    return "Worth comparing";
}
function getAreaShortName(area) {
    const parts = area.split(/[-·]/).map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? area;
}
function normalizeText(value) {
    return value.toLowerCase().trim();
}
function getTokens(value) {
    return normalizeText(value)
        .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
        .filter((token) => token.length >= 2);
}
function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
