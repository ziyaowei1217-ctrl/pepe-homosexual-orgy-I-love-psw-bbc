import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  CreateHousingListingDto,
  CreateRoommateProfileDto,
  UpdateHousingListingDto,
  UpdateProfileDto,
  UpdateRoommateProfileDto
} from "./dto";

@Injectable()
export class MarketplaceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getMyProfile(email: string) {
    return this.ensureProfile(email);
  }

  async updateMyProfile(email: string, dto: UpdateProfileDto) {
    const profile = await this.ensureProfile(email);

    return this.prisma.profile.update({
      where: { id: profile.id },
      data: definedData({
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        school: dto.school,
        city: dto.city,
        role: dto.role,
        wechat: dto.wechat,
        instagram: dto.instagram,
        bio: dto.bio
      })
    });
  }

  async createRoommateProfile(email: string, dto: CreateRoommateProfileDto) {
    this.assertBudgetRange(dto.budgetMin, dto.budgetMax);
    const profile = await this.ensureProfile(email);

    return this.prisma.roommateMatchingProfile.create({
      data: roommateProfileData(profile.id, dto)
    });
  }

  findRoommateProfiles(query: { city?: string; school?: string }) {
    return this.prisma.roommateMatchingProfile.findMany({
      where: definedData({
        city: query.city,
        school: query.school,
        status: "active"
      }),
      orderBy: { updatedAt: "desc" }
    });
  }

  async updateRoommateProfile(email: string, id: string, dto: UpdateRoommateProfileDto) {
    this.assertBudgetRange(dto.budgetMin, dto.budgetMax);
    const profile = await this.ensureProfile(email);
    const existing = await this.prisma.roommateMatchingProfile.findFirst({
      where: {
        id,
        userId: profile.id
      }
    });
    if (!existing) throw new NotFoundException("Roommate profile not found");

    return this.prisma.roommateMatchingProfile.update({
      where: { id },
      data: roommateProfileUpdateData(dto)
    });
  }

  async createHousingListing(email: string, dto: CreateHousingListingDto) {
    const profile = await this.ensureProfile(email);

    return this.prisma.housingListing.create({
      data: {
        ownerId: profile.id,
        ...housingListingData(dto),
        status: "draft"
      }
    });
  }

  findHousingListings(query: { city?: string; schoolNearby?: string; neighborhood?: string }) {
    return this.prisma.housingListing.findMany({
      where: definedData({
        city: query.city,
        schoolNearby: query.schoolNearby,
        neighborhood: query.neighborhood,
        status: "active"
      }),
      orderBy: { updatedAt: "desc" }
    });
  }

  async findHousingListing(id: string) {
    const listing = await this.prisma.housingListing.findFirst({
      where: {
        id,
        status: "active"
      }
    });
    if (!listing) throw new NotFoundException("Listing not found");

    return listing;
  }

  async updateHousingListing(email: string, id: string, dto: UpdateHousingListingDto) {
    const profile = await this.ensureProfile(email);
    const existing = await this.prisma.housingListing.findFirst({
      where: {
        id,
        ownerId: profile.id
      }
    });
    if (!existing) throw new NotFoundException("Listing not found");

    return this.prisma.housingListing.update({
      where: { id },
      data: housingListingUpdateData(dto)
    });
  }

  private async ensureProfile(email: string) {
    return this.prisma.profile.upsert({
      where: { email },
      update: {},
      create: { email }
    });
  }

  private assertBudgetRange(budgetMin?: number, budgetMax?: number) {
    if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
      throw new BadRequestException("budgetMin cannot be greater than budgetMax");
    }
  }
}

function roommateProfileData(userId: string, dto: CreateRoommateProfileDto) {
  return {
    userId,
    ...roommateProfileUpdateData(dto),
    status: "active"
  };
}

function roommateProfileUpdateData(dto: UpdateRoommateProfileDto | CreateRoommateProfileDto) {
  return definedData({
    school: dto.school,
    city: dto.city,
    budgetMin: dto.budgetMin,
    budgetMax: dto.budgetMax,
    moveInDate: dateValue(dto.moveInDate),
    moveOutDate: dateValue(dto.moveOutDate),
    preferredNeighborhoods: dto.preferredNeighborhoods,
    roomType: dto.roomType,
    cleanliness: dto.cleanliness,
    sleepSchedule: dto.sleepSchedule,
    smoking: dto.smoking,
    pets: dto.pets,
    guests: dto.guests,
    intro: dto.intro,
    lookingFor: dto.lookingFor,
    status: "status" in dto ? dto.status : undefined
  });
}

function housingListingData(dto: CreateHousingListingDto) {
  return {
    title: dto.title,
    listingType: dto.listingType,
    propertyType: dto.propertyType,
    roomType: dto.roomType,
    priceMonthly: dto.priceMonthly,
    depositAmount: dto.depositAmount,
    city: dto.city,
    neighborhood: dto.neighborhood,
    schoolNearby: dto.schoolNearby,
    addressApprox: dto.addressApprox,
    lat: dto.lat,
    lng: dto.lng,
    moveInDate: new Date(dto.moveInDate),
    moveOutDate: dateValue(dto.moveOutDate),
    flexibleDates: dto.flexibleDates ?? false,
    bedrooms: dto.bedrooms,
    bathrooms: dto.bathrooms,
    furnished: dto.furnished ?? false,
    utilitiesIncluded: dto.utilitiesIncluded ?? false,
    laundry: dto.laundry ?? false,
    parking: dto.parking ?? false,
    petsAllowed: dto.petsAllowed ?? false,
    leaseApproved: dto.leaseApproved ?? false,
    description: dto.description,
    photoUrls: dto.photoUrls ?? []
  };
}

function housingListingUpdateData(dto: UpdateHousingListingDto) {
  return definedData({
    title: dto.title,
    listingType: dto.listingType,
    propertyType: dto.propertyType,
    roomType: dto.roomType,
    priceMonthly: dto.priceMonthly,
    depositAmount: dto.depositAmount,
    city: dto.city,
    neighborhood: dto.neighborhood,
    schoolNearby: dto.schoolNearby,
    addressApprox: dto.addressApprox,
    lat: dto.lat,
    lng: dto.lng,
    moveInDate: dateValue(dto.moveInDate),
    moveOutDate: dateValue(dto.moveOutDate),
    flexibleDates: dto.flexibleDates,
    bedrooms: dto.bedrooms,
    bathrooms: dto.bathrooms,
    furnished: dto.furnished,
    utilitiesIncluded: dto.utilitiesIncluded,
    laundry: dto.laundry,
    parking: dto.parking,
    petsAllowed: dto.petsAllowed,
    leaseApproved: dto.leaseApproved,
    description: dto.description,
    photoUrls: dto.photoUrls,
    status: dto.status
  });
}

function dateValue(value?: string) {
  return value ? new Date(value) : undefined;
}

function definedData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
