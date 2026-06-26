"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const match_demo_1 = require("../lib/match-demo");
const roommate = {
    id: "roommate-1",
    name: "Jasmine",
    age: 23,
    role: "Northeastern University - MS Data Science",
    image: "https://example.com/jasmine.jpg",
    match: 89,
    budget: "$1,600/月",
    commute: "Back Bay / Fenway",
    tags: ["Clean", "Early riser", "No smoking", "Study focused"]
};
const groupMembers = [
    {
        id: "roommate-2",
        name: "Alex",
        age: 24,
        role: "Northeastern University - MS Data Science",
        image: "https://example.com/alex.jpg",
        match: 92,
        budget: "$1,400/月",
        commute: "Back Bay",
        tags: ["Clean", "Study focused", "Gym 3-4x/week"]
    }
];
const listings = [
    {
        id: "listing-1",
        title: "Back Bay 2B1B Furnished",
        area: "Boston - Back Bay",
        image: "https://example.com/back-bay.jpg",
        price: 1550,
        originalPrice: 1800,
        beds: 2,
        baths: 1,
        commute: "8 min walk to T",
        transit: "Back Bay station",
        trust: "Verified listing - landlord aware",
        tags: ["Group 推荐", "视频验房", "房东知情"],
        score: 4.9
    },
    {
        id: "listing-2",
        title: "Luxury Studio",
        area: "Boston - Seaport",
        image: "https://example.com/studio.jpg",
        price: 3100,
        originalPrice: 3300,
        beds: 1,
        baths: 1,
        commute: "25 min by transit",
        transit: "Silver line",
        trust: "Unverified",
        tags: ["Studio"],
        score: 4.5
    }
];
(0, node_test_1.default)("parses roommate budget strings into monthly numbers", () => {
    strict_1.default.equal((0, match_demo_1.getBudgetNumber)(roommate), 1600);
});
(0, node_test_1.default)("builds match fit with budget, commute, lifestyle, and trust scores", () => {
    const fit = (0, match_demo_1.buildMatchFit)(roommate, listings, groupMembers);
    strict_1.default.equal(fit.overall, 89);
    strict_1.default.equal(fit.sharedBudgetLabel, "$1,400 - $1,600 / person");
    strict_1.default.equal(fit.metrics.map((metric) => metric.label).join(","), "Budget overlap,Commute overlap,Lifestyle compatibility,Trust status");
    strict_1.default.ok(fit.metrics.every((metric) => metric.score >= 80));
});
(0, node_test_1.default)("recommends group-suitable homes before poor fits", () => {
    const recommended = (0, match_demo_1.recommendListingsForRoommate)(roommate, listings, groupMembers);
    strict_1.default.equal(recommended[0].id, "listing-1");
    strict_1.default.equal(recommended[0].fitLabel, "Best match");
});
(0, node_test_1.default)("builds a deal room with group members, recommendations, messages, and pipeline", () => {
    const dealRoom = (0, match_demo_1.buildDealRoom)(roommate, listings, groupMembers);
    strict_1.default.deepEqual(dealRoom.members.map((member) => member.name), ["Alex", "Jasmine"]);
    strict_1.default.equal(dealRoom.recommendedHomes[0].id, "listing-1");
    strict_1.default.equal(dealRoom.pipeline[0].status, "active");
    strict_1.default.equal(dealRoom.primaryCta, "Request group tour");
    strict_1.default.ok(dealRoom.messages[0].body.includes("Back Bay"));
});
