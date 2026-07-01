import { Prisma, PrismaClient } from "@prisma/client";

import { seedGroups, seedListings, seedRoommates, seedTrips, seedTrustQueues } from "./seed-data";

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

  for (const roommate of seedRoommates) {
    await prisma.roommateProfile.upsert({
      where: { id: roommate.id },
      update: roommate,
      create: roommate
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

  console.log(`Seeded ${seedListings.length} Los Angeles listings and ${seedRoommates.length} roommates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
