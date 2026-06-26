import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { seedListings } from "../seed-data";
import { ListingDto } from "./dto";

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const records = await this.prisma.listing.findMany({
      orderBy: { createdAt: "desc" }
    });

    return records.length > 0 ? records : seedListings;
  }

  async findOne(id: string) {
    const record = await this.prisma.listing.findUnique({ where: { id } });
    if (record) return record;

    const seeded = seedListings.find((listing) => listing.id === id);
    if (!seeded) throw new NotFoundException("Listing not found");

    return seeded;
  }

  async create(ownerId: string, dto: ListingDto) {
    return this.prisma.listing.create({
      data: {
        ownerId,
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

  async update(ownerId: string, id: string, dto: Partial<ListingDto>) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");

    return this.prisma.listing.update({
      where: { id },
      data: dto
    });
  }
}
