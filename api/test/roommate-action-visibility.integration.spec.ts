import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RoommateMatchService } from "../src/roommates/roommate-match.service";
import { RoommateConversationsService } from "../src/roommate-conversations/roommate-conversations.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const database = createDisposablePostgres("roommate_action_visibility");

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("roommate action visibility on disposable PostgreSQL", () => {
  let observer: PrismaClient;
  let actor: PrismaClient;
  let archiver: PrismaClient;
  let fixtureIndex = 0;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    observer = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    actor = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    archiver = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await Promise.all([observer.$connect(), actor.$connect(), archiver.$connect()]);
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([observer?.$disconnect(), actor?.$disconnect(), archiver?.$disconnect()]);
    database.drop();
  });

  it.each([
    { status: "hidden", archivedAt: new Date() },
    { status: "matched", archivedAt: new Date() },
    { status: "active", archivedAt: new Date() }
  ])("rejects saved target IDs after removal from discovery: %o", async (visibility) => {
    const fixture = await createPair();
    await observer.roommateProfile.update({ where: { id: fixture.targetProfileId }, data: visibility });
    for (const action of ["LIKE", "PASS", "LATER"] as const) {
      await expect(new RoommateMatchService(actor as never).recordAction(fixture.actorId, fixture.targetProfileId, action))
        .rejects.toBeInstanceOf(NotFoundException);
    }
    await assertNoNewContact(fixture);
  });

  it.each(["target", "actor"])("waits for a concurrent %s archive and never publishes contact", async (archivedParticipant) => {
    const fixture = await createPair();
    let releaseArchive!: () => void;
    let reportLocked!: () => void;
    const release = new Promise<void>(resolve => { releaseArchive = resolve; });
    const locked = new Promise<void>(resolve => { reportLocked = resolve; });
    const archiving = archiver.$transaction(async transaction => {
      await transaction.roommateProfile.update({
        where: { id: archivedParticipant === "target" ? fixture.targetProfileId : fixture.actorProfileId },
        data: { status: "hidden", archivedAt: new Date() }
      });
      reportLocked();
      await release;
    });
    await locked;
    const action = new RoommateMatchService(actor as never).recordAction(fixture.actorId, fixture.targetProfileId, "LIKE")
      .then(value => ({ value }), error => ({ error }));
    try {
      await waitForVisibilityLock();
    } finally {
      releaseArchive();
      await archiving;
    }
    expect(await action).toMatchObject({ error: expect.any(archivedParticipant === "target" ? NotFoundException : BadRequestException) });
    await assertNoNewContact(fixture);
  });

  it("preserves participant history access after hiding both profiles while rejecting new discovery actions", async () => {
    const fixture = await createPair();
    const result = await new RoommateMatchService(actor as never).recordAction(fixture.actorId, fixture.targetProfileId, "LIKE");
    expect(result.conversation).not.toBeNull();
    const conversationId = result.conversation!.id;
    const messages = new RoommateConversationsService(actor as never, { publish: async () => undefined }, { consume: async () => undefined });
    await messages.sendMessage(fixture.actorId, conversationId, {
      clientMessageId: "e788c8e1-05af-4b49-a698-ec8cc13ed13b", body: "Participant history remains authorized"
    });
    await observer.roommateProfile.updateMany({
      where: { ownerId: { in: [fixture.actorId, fixture.targetId] } }, data: { status: "hidden", archivedAt: new Date() }
    });
    await expect(new RoommateMatchService(actor as never).recordAction(fixture.actorId, fixture.targetProfileId, "LIKE"))
      .rejects.toBeInstanceOf(NotFoundException);
    expect((await messages.listMessages(fixture.targetId, conversationId, {})).messages)
      .toEqual([expect.objectContaining({ body: "Participant history remains authorized", senderRole: "peer" })]);
    expect(await observer.roommateConversation.count({ where: { id: conversationId } })).toBe(1);
    expect(await observer.roommateConversationMember.count({ where: { conversationId } })).toBe(2);
  });

  async function createPair() {
    const prefix = `visibility-${++fixtureIndex}`;
    const actorId = `${prefix}-actor`;
    const targetId = `${prefix}-target`;
    const actorProfileId = `${prefix}-profile-actor`;
    const targetProfileId = `${prefix}-profile-target`;
    await observer.user.createMany({ data: [actorId, targetId].map(id => ({ id, email: `${id}@visibility.example` })) });
    await observer.roommateProfile.createMany({ data: [
      { id: actorProfileId, ownerId: actorId }, { id: targetProfileId, ownerId: targetId }
    ].map(identity => ({ ...identity, name: identity.ownerId, age: 25, role: "Student", image: "https://example.test/photo.png",
      match: 0, budget: "$1000", commute: "LA", tags: [], status: "active", archivedAt: null })) });
    // A prior one-sided like is insufficient authority after the profile is hidden.
    await observer.roommateAction.create({ data: { userId: targetId, roommateProfileId: actorProfileId, action: "LIKE" } });
    return { actorId, targetId, actorProfileId, targetProfileId };
  }

  async function assertNoNewContact(fixture: Awaited<ReturnType<typeof createPair>>) {
    expect(await observer.roommateAction.count({ where: { userId: fixture.actorId, roommateProfileId: fixture.targetProfileId } })).toBe(0);
    expect(await observer.roommateMatch.count({ where: { OR: [{ firstUserId: fixture.actorId }, { secondUserId: fixture.actorId }] } })).toBe(0);
    expect(await observer.roommateConversationMember.count({ where: { userId: fixture.actorId } })).toBe(0);
  }

  async function waitForVisibilityLock() {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await observer.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
          AND query LIKE '%RoommateProfile%') AS waiting
      `;
      if (waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Action did not wait for the profile visibility lock");
  }
});
