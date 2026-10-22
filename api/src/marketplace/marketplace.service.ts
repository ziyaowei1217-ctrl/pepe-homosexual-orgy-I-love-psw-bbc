import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Profile, RoommateMatchingProfile } from "@prisma/client";

import { parseStrictDate } from "../http/strict-date";
import { PrismaService } from "../prisma/prisma.service";
import { dateOnly } from "../roommates/matching";
import { roommateCode, roommateLabel } from "../roommates/roommate-values";
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
    this.assertDateRange(dateValue(dto.moveInDate, "moveInDate"), dateValue(dto.moveOutDate, "moveOutDate"));
    const profile = await this.ensureProfile(email);

    return this.prisma.$transaction(async (transaction) => {
      const matchingProfile = await transaction.roommateMatchingProfile.create({
        data: roommateProfileData(profile.id, dto)
      });
      await this.projectOwnedRoommateProfile(transaction, ownerId, profile, matchingProfile, dto.age);
      return matchingProfile;
    });
  }

  async getMyRoommateProfile(ownerId: string, email: string) {
    const [profile, card] = await Promise.all([
      this.prisma.profile.findUnique({ where: { email } }),
      this.prisma.roommateProfile.findUnique({ where: { ownerId }, select: { id: true, age: true } })
    ]);
    const matching = profile
      ? await this.prisma.roommateMatchingProfile.findFirst({ where: { userId: profile.id }, orderBy: { updatedAt: "desc" } })
      : null;
    if (!profile || !matching) return { profile: null };

    return {
      profile: {
        id: matching.id,
        cardId: card?.id ?? null,
        displayName: profile.displayName,
        age: card?.age ?? null,
        gender: matching.gender,
        genderPreference: matching.genderPreference,
        school: matching.school,
        city: matching.city,
        budgetMin: matching.budgetMin,
        budgetMax: matching.budgetMax,
        moveInDate: dateOnly(matching.moveInDate),
        moveOutDate: dateOnly(matching.moveOutDate),
        preferredNeighborhoods: matching.preferredNeighborhoods,
        roomType: matching.roomType,
        sleepSchedule: roommateCode("sleepSchedule", matching.sleepSchedule),
        cleanliness: roommateCode("cleanliness", matching.cleanliness),
        guests: roommateCode("guests", matching.guests),
        smoking: roommateCode("smoking", matching.smoking),
        pets: roommateCode("pets", matching.pets),
        dealbreakers: matching.dealbreakers,
        intro: matching.intro,
        lookingFor: matching.lookingFor,
        status: matching.status
      }
    };
  }

  findRoommateProfiles(query: { city?: string; school?: string }) {
    return this.prisma.roommateMatchingProfile.findMany({
      where: definedData({
        city: query.city,
        school: query.school,
        status: "active"
      }),
      // Public route: the owner's profile id and the private matching preferences stay out.
      omit: { userId: true, gender: true, genderPreference: true, dealbreakers: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  async updateRoommateProfile(ownerId: string, email: string, id: string, dto: UpdateRoommateProfileDto) {
    const profile = await this.ensureProfile(email);
    return this.prisma.$transaction(async (transaction) => {
      // Serialize partial updates before reading the bounds they will merge with.
      // Non-key row locking remains compatible with foreign-key readers.
      await transaction.$queryRaw`SELECT "id" FROM "roommate_profiles"
        WHERE "id" = ${id}::uuid AND "user_id" = ${profile.id}::uuid FOR NO KEY UPDATE`.catch(rethrowMalformedUuidAsNotFound);
      const existing = await transaction.roommateMatchingProfile.findFirst({
        where: {
          id,
          userId: profile.id
        }
      });
      if (!existing) throw new NotFoundException("Roommate profile not found");
      this.assertBudgetRange(
        dto.budgetMin !== undefined ? dto.budgetMin : existing.budgetMin,
        dto.budgetMax !== undefined ? dto.budgetMax : existing.budgetMax
      );
      const moveInDate = dateValue(dto.moveInDate, "moveInDate");
      const moveOutDate = dateValue(dto.moveOutDate, "moveOutDate");
      this.assertDateRange(
        moveInDate !== undefined ? moveInDate : existing.moveInDate,
        moveOutDate !== undefined ? moveOutDate : existing.moveOutDate
      );

      const matchingProfile = await transaction.roommateMatchingProfile.update({
        where: { id },
        data: roommateProfileUpdateData(dto)
      });
      await this.projectOwnedRoommateProfile(transaction, ownerId, profile, matchingProfile, dto.age);
      return matchingProfile;
    });
  }

  private async ensureProfile(email: string) {
    return this.prisma.profile.upsert({
      where: { email },
      update: {},
      create: { email }
    });
  }

  private assertBudgetRange(budgetMin?: number | null, budgetMax?: number | null) {
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      throw new BadRequestException("budgetMin cannot be greater than budgetMax");
    }
  }

  private assertDateRange(moveInDate?: Date | null, moveOutDate?: Date | null) {
    // These columns are date-only; compare the UTC dates PostgreSQL stores.
    if (moveInDate && moveOutDate && moveInDate.toISOString().slice(0, 10) > moveOutDate.toISOString().slice(0, 10)) {
      throw new BadRequestException("moveInDate cannot be later than moveOutDate");
    }
  }

  private async projectOwnedRoommateProfile(
    transaction: Pick<Prisma.TransactionClient, "roommateProfile">,
    ownerId: string,
    profile: ProjectedProfile,
    matchingProfile: RoommateMatchingProfile,
    age?: number
  ) {
    const data = ownedRoommateProfileData(profile, matchingProfile, age);
    const existing = await transaction.roommateProfile.findUnique({ where: { ownerId } });
    const publicAge = age ?? existing?.age;
    if (publicAge === undefined) throw new BadRequestException("Roommate profile age is required");

    return transaction.roommateProfile.upsert({
      where: { ownerId },
      create: { ownerId, ...data, age: publicAge },
      update: data
    });
  }
}

type ProjectedProfile = Pick<Profile, "displayName" | "avatarUrl" | "city" | "school">;

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
    moveInDate: dateValue(dto.moveInDate, "moveInDate"),
    moveOutDate: dateValue(dto.moveOutDate, "moveOutDate"),
    preferredNeighborhoods: dto.preferredNeighborhoods,
    roomType: dto.roomType,
    cleanliness: dto.cleanliness,
    sleepSchedule: dto.sleepSchedule,
    smoking: dto.smoking,
    pets: dto.pets,
    guests: dto.guests,
    gender: dto.gender,
    genderPreference: dto.genderPreference,
    dealbreakers: dto.dealbreakers,
    intro: dto.intro,
    lookingFor: dto.lookingFor,
    status: "status" in dto ? dto.status : undefined
  });
}

/** null clears the date; undefined leaves it unchanged. */
function dateValue(value: string | null | undefined, field: string) {
  return value == null ? value : parseStrictDate(value, field);
}

function definedData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

const cardTagFields = ["sleepSchedule", "cleanliness", "guests", "smoking", "pets", "roomType"] as const;

function ownedRoommateProfileData(profile: ProjectedProfile, matchingProfile: RoommateMatchingProfile, age?: number) {
  const name = profile.displayName ?? "室友";
  const tags = cardTagFields
    .map((field) => roommateLabel(field, matchingProfile[field]))
    .filter((label): label is string => label !== null);

  return {
    name,
    ...(age !== undefined ? { age } : {}),
    role: matchingProfile.school ?? profile.school ?? "",
    image: profile.avatarUrl ?? `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
    match: 0,
    budget: formatBudget(matchingProfile.budgetMin, matchingProfile.budgetMax),
    commute: matchingProfile.city ?? profile.city ?? "Flexible",
    tags: tags.length > 0 ? tags : ["找室友"],
    matchingProfileId: matchingProfile.id,
    ...ownedRoommateProfileStatus(matchingProfile.status)
  };
}

function ownedRoommateProfileStatus(status: string) {
  if (status === "active") return { status: "active", archivedAt: null };
  if (status === "hidden") return { status: "hidden", archivedAt: new Date() };
  if (status === "matched") return { status: "matched", archivedAt: new Date() };
  throw new BadRequestException("Unsupported roommate profile status");
}

function formatBudget(budgetMin: number | null, budgetMax: number | null) {
  if (budgetMin !== null && budgetMax !== null) return `$${budgetMin.toLocaleString()}–$${budgetMax.toLocaleString()}/month`;
  if (budgetMin !== null) return `From $${budgetMin.toLocaleString()}/month`;
  if (budgetMax !== null) return `Up to $${budgetMax.toLocaleString()}/month`;
  return "Flexible";
}

/** A non-UUID path id makes Postgres reject the ::uuid cast (22P02); that is a missing profile, not a server error. */
function rethrowMalformedUuidAsNotFound(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && /22P02|invalid input syntax for type uuid/.test(JSON.stringify(error.meta ?? {}) + error.message)) {
    throw new NotFoundException("Roommate profile not found");
  }
  throw error;
}
