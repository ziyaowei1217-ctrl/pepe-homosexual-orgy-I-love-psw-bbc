import { ForbiddenException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

const publishRoles = new Set(["lister", "both"]);

export async function requirePublishCapableProfile(prisma: PrismaService, email: string) {
  const profile = await prisma.profile.findUnique({
    where: { email },
    select: {
      id: true,
      displayName: true,
      school: true,
      city: true,
      role: true
    }
  });

  if (
    !profile ||
    !isNonBlank(profile.displayName) ||
    !isNonBlank(profile.school) ||
    !isNonBlank(profile.city) ||
    !publishRoles.has(profile.role)
  ) {
    throw new ForbiddenException("A complete lister profile is required to publish listings");
  }

  return profile;
}

function isNonBlank(value: string | null) {
  return Boolean(value?.trim());
}
