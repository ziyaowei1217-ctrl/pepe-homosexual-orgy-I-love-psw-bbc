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

  async createRoommateProfile(ownerId: string, email: string, dto: CreateRoommateProfileDto) {
    this.assertBudgetRange(dto.budgetMin, dto.budgetMax);
    const profile = await this.ensureProfile(email);

    const matchingProfile = await this.prisma.roommateMatchingProfile.create({
      data: roommateProfileData(profile.id, dto)
    });
    await this.projectOwnedRoommateProfile(ownerId, profile, matchingProfile);
    return matchingProfile;
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

  async updateRoommateProfile(ownerId: string, email: string, id: string, dto: UpdateRoommateProfileDto) {
    this.assertBudgetRange(dto.budgetMin, dto.budgetMax);
    const profile = await this.ensureProfile(email);
    const existing = await this.prisma.roommateMatchingProfile.findFirst({
      where: {
        id,
        userId: profile.id
      }
    });
    if (!existing) throw new NotFoundException("Roommate profile not found");

    const matchingProfile = await this.prisma.roommateMatchingProfile.update({
      where: { id },
      data: roommateProfileUpdateData(dto)
    });
    await this.projectOwnedRoommateProfile(ownerId, profile, matchingProfile);
    return matchingProfile;
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

  private projectOwnedRoommateProfile(
    ownerId: string,
    profile: { email: string; displayName: string | null; avatarUrl: string | null; role: string; city: string | null; school: string | null },
    matchingProfile: {
      school: string | null;
      city: string | null;
      budgetMin: number | null;
      budgetMax: number | null;
      roomType: string | null;
      cleanliness: string | null;
      sleepSchedule: string | null;
      pets: string | null;
      status: string;
    }
  ) {
    const data = ownedRoommateProfileData(profile, matchingProfile);
    return this.prisma.roommateProfile.upsert({
      where: { ownerId },
      create: { ownerId, ...data },
      update: data
    });
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

function ownedRoommateProfileData(
  profile: { email: string; displayName: string | null; avatarUrl: string | null; role: string; city: string | null; school: string | null },
  matchingProfile: {
    school: string | null;
    city: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    roomType: string | null;
    cleanliness: string | null;
    sleepSchedule: string | null;
    pets: string | null;
    status: string;
  }
) {
  const atSignIndex = profile.email.indexOf("@");
  const name = profile.displayName ?? (atSignIndex > 0 ? profile.email.slice(0, atSignIndex) : profile.email);
  const tags = [matchingProfile.school ?? profile.school, matchingProfile.roomType, matchingProfile.cleanliness, matchingProfile.sleepSchedule, matchingProfile.pets]
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);

  return {
    name,
    age: 18,
    role: profile.role,
    image: profile.avatarUrl ?? `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
    match: 0,
    budget: formatBudget(matchingProfile.budgetMin, matchingProfile.budgetMax),
    commute: matchingProfile.city ?? profile.city ?? "Flexible",
    tags: tags.length > 0 ? tags : ["roommate search"],
    status: matchingProfile.status === "hidden" ? "hidden" : "active",
    archivedAt: matchingProfile.status === "hidden" ? new Date() : null
  };
}

function formatBudget(budgetMin: number | null, budgetMax: number | null) {
  if (budgetMin !== null && budgetMax !== null) return `$${budgetMin.toLocaleString()}–$${budgetMax.toLocaleString()}/month`;
  if (budgetMin !== null) return `From $${budgetMin.toLocaleString()}/month`;
  if (budgetMax !== null) return `Up to $${budgetMax.toLocaleString()}/month`;
  return "Flexible";
}
