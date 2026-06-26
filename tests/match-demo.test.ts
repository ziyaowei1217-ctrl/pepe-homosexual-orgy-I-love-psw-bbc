import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDealRoom,
  buildMatchFit,
  getBudgetNumber,
  recommendListingsForRoommate,
  type DemoListing,
  type DemoRoommate
} from "../lib/match-demo";

const roommate: DemoRoommate = {
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

const groupMembers: DemoRoommate[] = [
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

const listings: DemoListing[] = [
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

test("parses roommate budget strings into monthly numbers", () => {
  assert.equal(getBudgetNumber(roommate), 1600);
});

test("builds match fit with budget, commute, lifestyle, and trust scores", () => {
  const fit = buildMatchFit(roommate, listings, groupMembers);

  assert.equal(fit.overall, 89);
  assert.equal(fit.sharedBudgetLabel, "$1,400 - $1,600 / person");
  assert.equal(
    fit.metrics.map((metric) => metric.label).join(","),
    "Budget overlap,Commute overlap,Lifestyle compatibility,Trust status"
  );
  assert.ok(fit.metrics.every((metric) => metric.score >= 80));
});

test("recommends group-suitable homes before poor fits", () => {
  const recommended = recommendListingsForRoommate(roommate, listings, groupMembers);

  assert.equal(recommended[0].id, "listing-1");
  assert.equal(recommended[0].fitLabel, "Best match");
});

test("builds a deal room with group members, recommendations, messages, and pipeline", () => {
  const dealRoom = buildDealRoom(roommate, listings, groupMembers);

  assert.deepEqual(dealRoom.members.map((member) => member.name), ["Alex", "Jasmine"]);
  assert.equal(dealRoom.recommendedHomes[0].id, "listing-1");
  assert.equal(dealRoom.pipeline[0].status, "active");
  assert.equal(dealRoom.primaryCta, "Request group tour");
  assert.ok(dealRoom.messages[0].body.includes("Back Bay"));
});
