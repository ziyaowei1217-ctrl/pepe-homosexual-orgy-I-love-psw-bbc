import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { seedListings } from "../seed-data";
import { ListingDto } from "./dto";

const editableListingStatuses = new Set(["DRAFT", "REJECTED"]);

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const records = await this.prisma.listing.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" }
    });

    return records.length > 0 ? records : seedListings;
  }

  async findOne(id: string) {
    const record = await this.prisma.listing.findUnique({ where: { id } });
    if (record?.status === "APPROVED") return record;
    if (record) throw new NotFoundException("Listing not found");

    const seeded = seedListings.find((listing) => listing.id === id);
    if (!seeded) throw new NotFoundException("Listing not found");

    return seeded;
  }

  async create(ownerId: string, dto: ListingDto) {
    return this.prisma.listing.create({
      data: {
        ownerId,
        status: "DRAFT",
        title: dto.title,
        area: dto.area,
        image: dto.image,
        price: dto.price,
        originalPrice: dto.originalPrice,
        beds: dto.beds,
        baths: dto.baths,
        commute: dto.commute,
        transit: dto.transit,
        trust: dto.trust,
        tags: dto.tags,
        score: dto.score ?? 4.8
      }
    });
  }

  async findMine(ownerId: string) {
    return this.prisma.listing.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async update(ownerId: string, id: string, dto: Partial<ListingDto>) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
    if (!editableListingStatuses.has(listing.status)) {
      throw new BadRequestException("Listing cannot be edited in its current status");
    }

    return this.prisma.listing.update({
      where: { id },
      data: listingUpdateData(dto)
    });
  }

  async submit(ownerId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
    if (!editableListingStatuses.has(listing.status)) {
      throw new BadRequestException("Listing cannot be submitted in its current status");
    }

    return this.prisma.listing.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        reviewedAt: null,
        reviewerId: null,
        rejectionReason: null
      }
    });
  }

  async findReviewQueue() {
    return this.prisma.listing.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" }
    });
  }

  async approve(id: string, reviewerId: string) {
    await this.requireSubmittedListing(id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewerId,
        rejectionReason: null
      }
    });
  }

  async reject(id: string, reviewerId: string, reason: string) {
    const rejectionReason = reason.trim();
    if (!rejectionReason) throw new BadRequestException("Rejection reason is required");

    await this.requireSubmittedListing(id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewerId,
        rejectionReason
      }
    });
  }

  private async requireSubmittedListing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.status !== "SUBMITTED") throw new BadRequestException("Listing is not submitted for review");

    return listing;
  }
}

function listingUpdateData(dto: Partial<ListingDto>) {
  return {
    title: dto.title,
    area: dto.area,
    image: dto.image,
    price: dto.price,
    originalPrice: dto.originalPrice,
    beds: dto.beds,
    baths: dto.baths,
    commute: dto.commute,
    transit: dto.transit,
    trust: dto.trust,
    tags: dto.tags,
    score: dto.score
  };
}
