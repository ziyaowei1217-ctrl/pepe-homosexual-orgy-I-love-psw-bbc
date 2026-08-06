import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { CreateRoommateProfileDto, UpdateProfileDto, UpdateRoommateProfileDto } from "./dto";

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

function dateValue(value?: string) {
  return value ? new Date(value) : undefined;
}

function definedData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
