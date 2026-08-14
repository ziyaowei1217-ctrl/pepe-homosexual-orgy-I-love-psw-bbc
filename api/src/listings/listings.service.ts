import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuditActor, AuditService } from "../audit/audit.service";
import { requirePublishCapableProfile } from "../marketplace/publish-profile";
import { PrismaService } from "../prisma/prisma.service";
import { CreateListingDto, ListingAvailabilityQueryDto, UpdateListingDto } from "./dto";
import { buildListingAvailabilityWhere, validateListingAvailability } from "./listing-availability";

const editableListingStatuses = new Set(["DRAFT", "REJECTED"]);
const listingMediaInclude = {
  media: {
    orderBy: {
      sortOrder: "asc" as const
    }
  }
};

@Injectable()
export class ListingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async findAll(query: ListingAvailabilityQueryDto = {}) {
    const availabilityWhere = buildListingAvailabilityWhere(query);
    const records = await this.prisma.listing.findMany({
      where: { status: "APPROVED", ...availabilityWhere },
      orderBy: { createdAt: "desc" }
    });

    return records.map(presentApprovedListing);
  }

  async findOne(id: string) {
    const record = await this.prisma.listing.findUnique({ where: { id }, include: listingMediaInclude });
    if (record?.status === "APPROVED") return presentApprovedListing(record);
    if (record) throw new NotFoundException("Listing not found");

    throw new NotFoundException("Listing not found");
  }

  async create(ownerId: string, dto: CreateListingDto) {
    await this.requirePublishCapableOwner(ownerId);
    const availability = validateListingAvailability(dto.availableFrom, dto.availableTo);

    return this.prisma.listing.create({
      data: {
        ownerId,
        status: "DRAFT",
        title: dto.title,
        area: dto.area,
        image: null,
        ...availability,
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
      orderBy: { updatedAt: "desc" },
      include: listingMediaInclude
    });
  }

  async update(ownerId: string, id: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
    const approvedAvailabilityEdit =
      listing.status === "APPROVED" && isAvailabilityOnlyUpdate(dto);
    if (!editableListingStatuses.has(listing.status) && !approvedAvailabilityEdit) {
      throw new BadRequestException("Listing cannot be edited in its current status");
    }
    await this.requirePublishCapableOwner(ownerId);

    const data = listingUpdateData(dto, listing);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("At least one editable listing field is required");
    }

    if (approvedAvailabilityEdit) {
      Object.assign(data, {
        status: "SUBMITTED",
        submittedAt: new Date(),
        reviewedAt: null,
        reviewerId: null,
        rejectionReason: null
      });
    }

    return this.prisma.listing.update({
      where: { id },
      data
    });
  }

  async submit(ownerId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
    if (!editableListingStatuses.has(listing.status)) {
      throw new BadRequestException("Listing cannot be submitted in its current status");
    }
    await this.requirePublishCapableOwner(ownerId);

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
      orderBy: { submittedAt: "asc" },
      include: listingMediaInclude
    });
  }

  async approve(id: string, actor: AuditActor) {
    return this.prisma.$transaction(async (transaction) => {
      const listing = await this.transitionSubmittedListing(transaction, id, {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewerId: actor.actorUserId,
        rejectionReason: null
      });
      await this.audit.append(transaction, {
        ...actor,
        action: "LISTING_APPROVED",
        targetType: "Listing",
        targetId: id,
        outcome: "SUCCESS",
        metadata: { reason: "manual_review_approved" }
      });
      return listing;
    });
  }

  async reject(id: string, actor: AuditActor, reason: string) {
    const rejectionReason = reason.trim();
    if (!rejectionReason) throw new BadRequestException("Rejection reason is required");

    return this.prisma.$transaction(async (transaction) => {
      const listing = await this.transitionSubmittedListing(transaction, id, {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewerId: actor.actorUserId,
        rejectionReason
      });
      await this.audit.append(transaction, {
        ...actor,
        action: "LISTING_REJECTED",
        targetType: "Listing",
        targetId: id,
        outcome: "SUCCESS",
        metadata: { reason: rejectionReason }
      });
      return listing;
    });
  }

  private async transitionSubmittedListing(
    transaction: Pick<Prisma.TransactionClient, "listing">,
    id: string,
    data: {
      status: "APPROVED" | "REJECTED";
      reviewedAt: Date;
      reviewerId?: string;
      rejectionReason: string | null;
    }
  ) {
    const transition = await transaction.listing.updateMany({
      where: { id, status: "SUBMITTED" },
      data
    });
    if (transition.count !== 1) {
      await this.requireSubmittedListing(id, transaction);
      throw new BadRequestException("Listing review transition did not complete");
    }
    const listing = await transaction.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException("Listing not found");
    return listing;
  }

  private async requireSubmittedListing(id: string, transaction: Pick<Prisma.TransactionClient, "listing">) {
    const listing = await transaction.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.status !== "SUBMITTED") throw new BadRequestException("Listing is not submitted for review");

    return listing;
  }

  private async requirePublishCapableOwner(ownerId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true }
    });
    if (!owner) throw new NotFoundException("User not found");

    return requirePublishCapableProfile(this.prisma, owner.email);
  }
}

function listingUpdateData(
  dto: UpdateListingDto,
  listing: { availableFrom: Date; availableTo: Date }
) {
  const availabilityChanged =
    dto.availableFrom !== undefined || dto.availableTo !== undefined;
  const availability = availabilityChanged
    ? validateListingAvailability(
        dto.availableFrom ?? formatListingDate(listing.availableFrom),
        dto.availableTo ?? formatListingDate(listing.availableTo)
      )
    : {};

  return definedData({
    title: dto.title,
    area: dto.area,
    ...availability,
    price: dto.price,
    originalPrice: dto.originalPrice,
    beds: dto.beds,
    baths: dto.baths,
    commute: dto.commute,
    transit: dto.transit,
    trust: dto.trust,
    tags: dto.tags,
    score: dto.score
  });
}

function isAvailabilityOnlyUpdate(dto: UpdateListingDto) {
  const fields = Object.entries(dto)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field);

  return (
    fields.length > 0 &&
    fields.every((field) => field === "availableFrom" || field === "availableTo")
  );
}

function formatListingDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function definedData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function approvedPublicTrust(value: string) {
  const trust = value.trim();
  if (!trust) return "平台已审核";
  const approvedMarker = "平台已审核";
  let includesApprovedMarker = false;
  const declarations = trust
    .replaceAll("待平台审核", approvedMarker)
    .replaceAll("待审核", approvedMarker)
    .split("·")
    .map((declaration) => declaration.trim().replaceAll(approvedMarker, () => {
      if (includesApprovedMarker) return "";
      includesApprovedMarker = true;
      return approvedMarker;
    }).trim())
    .filter(Boolean);

  if (!includesApprovedMarker) declarations.push(approvedMarker);
  return declarations.join(" · ");
}

function presentApprovedListing<T extends { trust: string }>(listing: T): T {
  return { ...listing, trust: approvedPublicTrust(listing.trust) };
}
