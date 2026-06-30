import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { seedListings, seedRoommates } from "../seed-data";

export type RoommateActionValue = "LIKE" | "PASS" | "LATER";

type RecordRoommateActionInput = {
  userId: string;
  roommateProfileId: string;
  action: RoommateActionValue;
};

type RoommateSnapshot = {
  id: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
};

type ListingSnapshot = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  beds: number;
  baths: number;
  commute: string;
  trust: string;
  tags: string[];
  fitLabel: "Best match" | "Strong fit" | "Worth comparing";
};

@Injectable()
export class DealRoomsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordRoommateAction(input: RecordRoommateActionInput) {
    const roommate = await this.resolveRoommateProfile(input.roommateProfileId);
    const action = await this.prisma.roommateAction.upsert({
      where: {
        userId_roommateProfileId: {
          userId: input.userId,
          roommateProfileId: roommate.id
        }
      },
      create: {
        userId: input.userId,
        roommateProfileId: roommate.id,
        action: input.action
      },
      update: {
        action: input.action
      }
    });

    if (input.action !== "LIKE") {
      return {
        action,
        dealRoom: null
      };
    }

    const dealRoom = await this.findOrCreateDealRoom(input.userId, roommate);
    await this.prisma.dealRoomMember.upsert({
      where: {
        dealRoomId_roommateProfileId: {
          dealRoomId: dealRoom.id,
          roommateProfileId: roommate.id
        }
      },
      create: {
        dealRoomId: dealRoom.id,
        roommateProfileId: roommate.id,
        snapshot: this.toRoommateSnapshot(roommate)
      },
      update: {
        snapshot: this.toRoommateSnapshot(roommate)
      }
    });

    return {
      action,
      dealRoom: this.toDealRoomResponse(dealRoom)
    };
  }

  async findActiveForUser(userId: string) {
    const rooms = await this.prisma.dealRoom.findMany({
      where: {
        ownerId: userId,
        status: "ACTIVE"
      },
      include: {
        members: true,
        tourRequest: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return rooms.map((room) => this.toDealRoomResponse(room));
  }

  async requestGroupTour(userId: string, dealRoomId: string) {
    const room = await this.prisma.dealRoom.findFirst({
      where: {
        id: dealRoomId,
        ownerId: userId,
        status: "ACTIVE"
      }
    });

    if (!room) throw new NotFoundException("Deal room not found");

    return this.prisma.tourRequest.upsert({
      where: {
        dealRoomId
      },
      create: {
        dealRoomId,
        requesterId: userId,
        status: "REQUESTED"
      },
      update: {}
    });
  }

  private async findOrCreateDealRoom(ownerId: string, roommate: RoommateSnapshot) {
    const existing = await this.prisma.dealRoom.findUnique({
      where: {
        ownerId_roommateProfileId: {
          ownerId,
          roommateProfileId: roommate.id
        }
      }
    });
    if (existing) return existing;

    const recommendedHomes = await this.buildRecommendedHomes(roommate);

    return this.prisma.dealRoom.create({
      data: {
        ownerId,
        roommateProfileId: roommate.id,
        status: "ACTIVE",
        recommendedHomes,
        pipeline: [
          { label: "Match", status: "active", detail: "Matched" },
          { label: "Shortlist", status: "ready", detail: `${recommendedHomes.length} homes` },
          { label: "Tour", status: "ready", detail: "Ready to schedule" },
          { label: "Apply", status: "idle", detail: "Not started" }
        ],
        trustChecklist: [
          { label: "ID verified", detail: "Both verified", complete: true },
          { label: "University verified", detail: "Both verified", complete: true },
          { label: "Background check", detail: "Both clear", complete: true },
          { label: "Payment history", detail: "On track", complete: true },
          { label: "References", detail: "2 shared", complete: true }
        ]
      }
    });
  }

  private async resolveRoommateProfile(id: string): Promise<RoommateSnapshot> {
    const record = await this.prisma.roommateProfile.findUnique({ where: { id } });
    if (record) return this.toRoommateSnapshot(record);

    const seeded = seedRoommates.find((roommate) => roommate.id === id);
    if (!seeded) throw new NotFoundException("Roommate profile not found");

    const created = await this.prisma.roommateProfile.create({
      data: {
        id: seeded.id,
        name: seeded.name,
        age: seeded.age,
        role: seeded.role,
        image: seeded.image,
        match: seeded.match,
        budget: seeded.budget,
        commute: seeded.commute,
        tags: seeded.tags
      }
    });

    return this.toRoommateSnapshot(created);
  }

  private async buildRecommendedHomes(roommate: RoommateSnapshot): Promise<ListingSnapshot[]> {
    const records = await this.prisma.listing.findMany({
      where: {
        status: "APPROVED"
      },
      orderBy: {
        score: "desc"
      },
      take: 6
    });
    const listings = records.length > 0 ? records : seedListings;
    const roommateTokens = getTokens(roommate.commute);

    return listings
      .map((listing) => {
        const listingTokens = getTokens(`${listing.area} ${listing.commute} ${listing.transit}`);
        const overlap = roommateTokens.filter((token) => listingTokens.includes(token)).length;
        const groupFit = listing.tags.some((tag) => tag.includes("Group")) || listing.beds > 1 ? 1 : 0;
        const trustFit = listing.trust.includes("认证") || listing.trust.toLowerCase().includes("verified") ? 1 : 0;
        const fitScore = overlap * 20 + groupFit * 12 + trustFit * 10 + listing.score * 10;

        const fitLabel = getFitLabel(fitScore);

        return {
          id: listing.id,
          title: listing.title,
          area: listing.area,
          image: listing.image,
          price: listing.price,
          beds: listing.beds,
          baths: listing.baths,
          commute: listing.commute,
          trust: listing.trust,
          tags: listing.tags,
          fitLabel,
          fitScore
        };
      })
      .sort((a, b) => b.fitScore - a.fitScore || a.price - b.price)
      .slice(0, 3)
      .map(({ fitScore: _fitScore, ...listing }) => listing);
  }

  private toDealRoomResponse(room: any) {
    return {
      ...room,
      canRequestTour: room.status === "ACTIVE"
    };
  }

  private toRoommateSnapshot(roommate: RoommateSnapshot): RoommateSnapshot {
    return {
      id: roommate.id,
      name: roommate.name,
      age: roommate.age,
      role: roommate.role,
      image: roommate.image,
      match: roommate.match,
      budget: roommate.budget,
      commute: roommate.commute,
      tags: roommate.tags
    };
  }
}

function getTokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter((token) => token.length >= 2);
}

function getFitLabel(score: number): ListingSnapshot["fitLabel"] {
  if (score >= 70) return "Best match";
  if (score >= 55) return "Strong fit";
  return "Worth comparing";
}
