import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type RoommateMatchingProfile } from "@prisma/client";

import { parseStrictDate } from "../http/strict-date";
import { PrismaService } from "../prisma/prisma.service";
import { assertRoommateDiscoveryCapacity, MAX_DISCOVERABLE_ROOMMATE_PROFILES } from "../roommates/discovery-capacity";
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
      const currentProfile = await this.lockOwnerProfile(transaction, profile.id);
      await this.lockOwnedRoommateProfile(transaction, ownerId);
      const existing = await this.findCanonicalRoommateProfile(transaction, profile.id);
      const owned = await transaction.roommateProfile.findUnique({ where: { ownerId } });
      if ((existing && existing.status !== "active") || (owned && (owned.status !== "active" || owned.archivedAt))) {
        throw new ConflictException("A hidden or archived roommate profile cannot be republished by creating another profile");
      }
      if (existing) this.assertMergedRanges(existing, dto);
      const data = roommateProfileData(profile.id, dto);
      const matchingProfile = existing
        ? await transaction.roommateMatchingProfile.update({ where: { id: existing.id }, data })
        : await transaction.roommateMatchingProfile.create({ data });
      await this.retireHistoricalRoommateProfiles(transaction, profile.id, matchingProfile.id);
      await this.projectOwnedRoommateProfile(transaction, ownerId, currentProfile, matchingProfile, dto.age);
      return matchingProfile;
    });
  }

  async findRoommateProfiles(query: { city?: string; school?: string }) {
    // Profile and User use different IDs. Check the owned public projection in
    // the same database read so archived historical matching rows stay private.
    const profiles = await this.prisma.$queryRaw<RoommateMatchingProfile[]>(Prisma.sql`
      SELECT matching.id, matching.user_id AS "userId", matching.school, matching.city,
        matching.budget_min AS "budgetMin", matching.budget_max AS "budgetMax",
        matching.move_in_date AS "moveInDate", matching.move_out_date AS "moveOutDate",
        matching.preferred_neighborhoods AS "preferredNeighborhoods", matching.room_type AS "roomType",
        matching.cleanliness, matching.sleep_schedule AS "sleepSchedule", matching.smoking, matching.pets,
        matching.guests, matching.intro, matching.looking_for AS "lookingFor", matching.status,
        matching.created_at AS "createdAt", matching.updated_at AS "updatedAt"
      FROM roommate_profiles AS matching
      WHERE matching.status = 'active'
        AND (${query.city ?? null}::text IS NULL OR matching.city = ${query.city ?? null})
        AND (${query.school ?? null}::text IS NULL OR matching.school = ${query.school ?? null})
        AND NOT EXISTS (
          SELECT 1 FROM roommate_profiles AS newer
          WHERE newer.user_id = matching.user_id
            AND (newer.created_at > matching.created_at
              OR (newer.created_at = matching.created_at AND newer.id > matching.id))
        )
        AND EXISTS (
          SELECT 1 FROM profiles AS profile
          JOIN "User" AS account ON account.email = profile.email
          JOIN "RoommateProfile" AS owned ON owned."ownerId" = account.id
          WHERE profile.id = matching.user_id AND owned.status = 'active' AND owned."archivedAt" IS NULL
        )
      ORDER BY matching.updated_at DESC, matching.id DESC
      LIMIT ${MAX_DISCOVERABLE_ROOMMATE_PROFILES + 1}
    `);
    assertRoommateDiscoveryCapacity(profiles.length);
    return profiles;
  }

  async updateRoommateProfile(ownerId: string, email: string, id: string, dto: UpdateRoommateProfileDto) {
    const profile = await this.ensureProfile(email);
    return this.prisma.$transaction(async (transaction) => {
      // A shared owner lock serializes creation and updates of every historical row.
      const currentProfile = await this.lockOwnerProfile(transaction, profile.id);
      await this.lockOwnedRoommateProfile(transaction, ownerId);
      const existing = await transaction.roommateMatchingProfile.findFirst({
        where: {
          id,
          userId: profile.id
        }
      });
      if (!existing) throw new NotFoundException("Roommate profile not found");
      const canonical = await this.findCanonicalRoommateProfile(transaction, profile.id);
      if (canonical?.id !== id) {
        throw new ConflictException("This historical roommate profile has been replaced by the current profile");
      }
      const owned = await transaction.roommateProfile.findUnique({ where: { ownerId } });
      // The owned row is locked above. Owner edits must never clear a moderator
      // archive, including an archive committed while this request waited.
      if (owned?.archivedAt) {
        throw new ConflictException("This roommate profile is archived; an administrator must restore it before editing");
      }
      this.assertMergedRanges(existing, dto);

      const matchingProfile = await transaction.roommateMatchingProfile.update({
        where: { id },
        data: roommateProfileUpdateData(dto)
      });
      await this.retireHistoricalRoommateProfiles(transaction, profile.id, matchingProfile.id);
      await this.projectOwnedRoommateProfile(transaction, ownerId, currentProfile, matchingProfile, dto.age);
      return matchingProfile;
    });
  }

  private async lockOwnerProfile(transaction: Prisma.TransactionClient, profileId: string) {
    await transaction.$queryRaw`SELECT "id" FROM "profiles"
      WHERE "id" = ${profileId}::uuid FOR NO KEY UPDATE`;
    const profile = await transaction.profile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException("Profile not found");
    return profile;
  }

  private findCanonicalRoommateProfile(transaction: Prisma.TransactionClient, profileId: string) {
    return transaction.roommateMatchingProfile.findFirst({
      where: { userId: profileId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  }

  private async lockOwnedRoommateProfile(transaction: Prisma.TransactionClient, ownerId: string) {
    // Moderator archive and matching both lock this row. Hold it before reading
    // visibility so a repeated POST cannot overwrite an archive that won first.
    await transaction.$queryRaw`SELECT "id" FROM "RoommateProfile"
      WHERE "ownerId" = ${ownerId} FOR NO KEY UPDATE`;
  }

  private retireHistoricalRoommateProfiles(transaction: Prisma.TransactionClient, profileId: string, canonicalId: string) {
    return transaction.roommateMatchingProfile.updateMany({
      where: { userId: profileId, id: { not: canonicalId }, status: "active" },
      data: { status: "hidden" }
    });
  }

  private assertMergedRanges(existing: RoommateMatchingProfile, dto: UpdateRoommateProfileDto | CreateRoommateProfileDto) {
    this.assertBudgetRange(
      dto.budgetMin !== undefined ? dto.budgetMin : existing.budgetMin,
      dto.budgetMax !== undefined ? dto.budgetMax : existing.budgetMax
    );
    this.assertDateRange(dateValue(dto.moveInDate, "moveInDate") ?? existing.moveInDate, dateValue(dto.moveOutDate, "moveOutDate") ?? existing.moveOutDate);
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
    },
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
    intro: dto.intro,
    lookingFor: dto.lookingFor,
    status: "status" in dto ? dto.status : undefined
  });
}

function dateValue(value: string | undefined, field: string) {
  return value ? parseStrictDate(value, field) : undefined;
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
  },
  age?: number
) {
  const atSignIndex = profile.email.indexOf("@");
  const name = profile.displayName ?? (atSignIndex > 0 ? profile.email.slice(0, atSignIndex) : profile.email);
  const tags = [matchingProfile.school ?? profile.school, matchingProfile.roomType, matchingProfile.cleanliness, matchingProfile.sleepSchedule, matchingProfile.pets]
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);

  return {
    name,
    ...(age !== undefined ? { age } : {}),
    role: profile.role,
    image: profile.avatarUrl ?? `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
    match: 0,
    budget: formatBudget(matchingProfile.budgetMin, matchingProfile.budgetMax),
    commute: matchingProfile.city ?? profile.city ?? "Flexible",
    tags: tags.length > 0 ? tags : ["roommate search"],
    ...ownedRoommateProfileStatus(matchingProfile.status)
  };
}

function ownedRoommateProfileStatus(status: string) {
  if (status === "active") return { status: "active", archivedAt: null };
  // Owner opt-out is enforced by status. Reserve archivedAt for administrator
  // moderation so hiding and restoring one's own card cannot erase an archive.
  if (status === "hidden") return { status: "hidden", archivedAt: null };
  if (status === "matched") return { status: "matched", archivedAt: null };
  throw new BadRequestException("Unsupported roommate profile status");
}

function formatBudget(budgetMin: number | null, budgetMax: number | null) {
  if (budgetMin !== null && budgetMax !== null) return `$${budgetMin.toLocaleString()}–$${budgetMax.toLocaleString()}/month`;
  if (budgetMin !== null) return `From $${budgetMin.toLocaleString()}/month`;
  if (budgetMax !== null) return `Up to $${budgetMax.toLocaleString()}/month`;
  return "Flexible";
}
