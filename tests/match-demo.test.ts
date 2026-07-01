import { describe, expect, it } from "vitest";

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
  role: "UCLA - MS Data Science",
  image: "https://example.com/jasmine.jpg",
  match: 89,
  budget: "$1,600/月",
  commute: "Westwood / Sawtelle",
  tags: ["Clean", "Early riser", "No smoking", "Study focused"]
};

const groupMembers: DemoRoommate[] = [
  {
    id: "roommate-2",
    name: "Alex",
    age: 24,
    role: "UCLA - MS Data Science",
    image: "https://example.com/alex.jpg",
    match: 92,
    budget: "$1,400/月",
    commute: "Westwood",
    tags: ["Clean", "Study focused", "Gym 3-4x/week"]
  }
];

const listings: DemoListing[] = [
  {
    id: "listing-1",
    title: "Westwood 2B1B Furnished",
    area: "Los Angeles - Westwood",
    image: "https://example.com/westwood.jpg",
    price: 1550,
    originalPrice: 1800,
    beds: 2,
    baths: 1,
    commute: "8 min walk to campus",
    transit: "Westwood transit center",
    trust: "Verified listing - landlord aware",
    tags: ["Group 推荐", "视频验房", "房东知情"],
    score: 4.9
  },
  {
    id: "listing-2",
    title: "Luxury Studio",
    area: "Los Angeles - Santa Monica",
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

describe("match demo", () => {
  it("parses roommate budget strings into monthly numbers", () => {
    expect(getBudgetNumber(roommate)).toBe(1600);
  });

  it("builds match fit with budget, commute, lifestyle, and trust scores", () => {
    const fit = buildMatchFit(roommate, listings, groupMembers);

    expect(fit.overall).toBe(89);
    expect(fit.sharedBudgetLabel).toBe("$1,400 - $1,600 / person");
    expect(fit.metrics.map((metric) => metric.label).join(",")).toBe(
      "Budget overlap,Commute overlap,Lifestyle compatibility,Trust status"
    );
    expect(fit.metrics.every((metric) => metric.score >= 80)).toBe(true);
  });

  it("recommends group-suitable homes before poor fits", () => {
    const recommended = recommendListingsForRoommate(roommate, listings, groupMembers);

    expect(recommended[0].id).toBe("listing-1");
    expect(recommended[0].fitLabel).toBe("Best match");
  });

  it("builds a deal room with group members, recommendations, messages, and pipeline", () => {
    const dealRoom = buildDealRoom(roommate, listings, groupMembers);

    expect(dealRoom.members.map((member) => member.name)).toEqual(["Alex", "Jasmine"]);
    expect(dealRoom.recommendedHomes[0].id).toBe("listing-1");
    expect(dealRoom.pipeline[0].status).toBe("active");
    expect(dealRoom.primaryCta).toBe("Request group tour");
    expect(dealRoom.messages[0].body).toContain("Westwood");
  });

  it("locks group tour until the current roommate has been liked", () => {
    const lockedDealRoom = buildDealRoom(roommate, listings, groupMembers, { readyForTour: false });

    expect(lockedDealRoom.canRequestTour).toBe(false);
    expect(lockedDealRoom.primaryCta).toBe("Like to unlock group tour");
    expect(lockedDealRoom.pipeline[2].status).toBe("idle");
    expect(lockedDealRoom.pipeline[2].detail).toBe("Like first");
  });

  it("unlocks group tour and derives commercial copy from live match data", () => {
    const partner: DemoRoommate = {
      ...groupMembers[0],
      id: "roommate-3",
      name: "Priya"
    };
    const readyDealRoom = buildDealRoom(roommate, listings, [partner], { readyForTour: true });

    expect(readyDealRoom.canRequestTour).toBe(true);
    expect(readyDealRoom.primaryCta).toBe("Request group tour");
    expect(readyDealRoom.messages[1].author).toBe("Priya");
    expect(readyDealRoom.mapFocusLabel).toBe("Westwood focus");
  });

  it("uses viewer copy when the liked roommate is the only matched member", () => {
    const readyDealRoom = buildDealRoom(roommate, listings, [roommate], {
      readyForTour: true,
      viewerName: "You"
    });

    expect(readyDealRoom.messages[1].author).toBe("You");
    expect(readyDealRoom.trustChecklist[0].detail).toBe("Both verified");
    expect(readyDealRoom.trustChecklist[2].detail).toBe("Both clear");
  });
});
