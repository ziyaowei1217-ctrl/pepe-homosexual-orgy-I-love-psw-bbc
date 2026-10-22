import { Prisma, PrismaClient } from "@prisma/client";

import { seedGroups, seedListings, seedRoommateMatching, seedRoommates, seedTrips, seedTrustQueues } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { id: "seed-user" },
    update: {
      email: "la-seed-owner@example.com",
      role: "USER"
    },
    create: {
      id: "seed-user",
      email: "la-seed-owner@example.com",
      role: "USER"
    }
  });

  await prisma.profile.upsert({
    where: { email: "la-seed-owner@example.com" },
    update: {
      displayName: "Marketplace Seed Owner",
      school: "Property Management",
      city: "United States",
      role: "lister",
      bio: "Property manager for the nationwide marketplace demo inventory."
    },
    create: {
      email: "la-seed-owner@example.com",
      displayName: "Marketplace Seed Owner",
      school: "Property Management",
      city: "United States",
      role: "lister",
      bio: "Property manager for the nationwide marketplace demo inventory."
    }
  });

  for (const listing of seedListings) {
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = listing;

    await prisma.listing.upsert({
      where: { id: listing.id },
      update: {
        ...data,
        status: "APPROVED"
      },
      create: {
        ...data,
        status: "APPROVED"
      }
    });
  }

  for (const [index, roommate] of seedRoommates.entries()) {
    const number = index + 1;
    const email = `seed-roommate-${number}@example.com`;
    const { moveInDate, moveOutDate, ...matching } = seedRoommateMatching[roommate.id];
    const owner = await prisma.user.upsert({
      where: { id: `seed-roommate-user-${number}` },
      update: { email },
      create: { id: `seed-roommate-user-${number}`, email, role: "USER" }
    });
    const profile = await prisma.profile.upsert({
      where: { email },
      update: { displayName: roommate.name, school: matching.school },
      create: { email, displayName: roommate.name, school: matching.school }
    });
    // Fixed ids keep re-runs idempotent; matching rows have no natural key.
    const matchingProfileId = `5eed0000-0000-4000-8000-${String(number).padStart(12, "0")}`;
    const matchingData = {
      ...matching,
      userId: profile.id,
      city: "Los Angeles",
      moveInDate: new Date(moveInDate),
      moveOutDate: moveOutDate ? new Date(moveOutDate) : null
    };
    await prisma.roommateMatchingProfile.upsert({
      where: { id: matchingProfileId },
      update: matchingData,
      create: { id: matchingProfileId, ...matchingData }
    });
    const card = { ...roommate, ownerId: owner.id, matchingProfileId, localReciprocalLike: index < 3 };
    await prisma.roommateProfile.upsert({
      where: { id: roommate.id },
      update: card,
      create: card
    });
  }

  for (const group of seedGroups) {
    await prisma.group.upsert({
      where: { id: group.id },
      update: {
        name: group.name,
        budget: group.budget,
        members: group.members as Prisma.InputJsonValue
      },
      create: {
        id: group.id,
        name: group.name,
        budget: group.budget,
        members: group.members as Prisma.InputJsonValue
      }
    });
  }

  for (const trip of seedTrips) {
    await prisma.booking.upsert({
      where: { id: trip.id },
      update: trip,
      create: trip
    });
  }

  for (const queue of seedTrustQueues) {
    await prisma.trustQueueItem.upsert({
      where: { id: queue.id },
      update: queue,
      create: queue
    });
  }

  console.log(`Seeded ${seedListings.length} marketplace listings and ${seedRoommates.length} roommates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
