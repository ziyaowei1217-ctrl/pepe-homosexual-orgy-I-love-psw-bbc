import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RoommateConversationsService } from "../src/roommate-conversations/roommate-conversations.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const describeDatabase = process.env.RUN_DB_SMOKE === "1" ? describe : describe.skip;
const database = createDisposablePostgres("roommate_send_close_lock");

describeDatabase("roommate send/close PostgreSQL serialization", () => {
  let closer: PrismaClient;
  let sender: PrismaClient;

  beforeAll(async () => {
    database.create();
    const prisma = join(__dirname, "..", "node_modules", ".bin", "prisma");
    const migration = spawnSync(prisma, ["migrate", "deploy", "--schema", "prisma/schema.prisma"], {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: database.databaseUrl }
    });
    if (migration.status !== 0) throw new Error(migration.stderr || migration.stdout);
    closer = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    sender = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await Promise.all([closer.$connect(), sender.$connect()]);
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([closer?.$disconnect(), sender?.$disconnect()]);
    database.drop();
  });

  it("waits for a concurrent close and then rejects the new message", async () => {
    const first = await closer.user.create({ data: { email: "lock-first@example.test" } });
    const second = await closer.user.create({ data: { email: "lock-second@example.test" } });
    const match = await closer.roommateMatch.create({
      data: { firstUserId: first.id, secondUserId: second.id }
    });
    const conversation = await closer.roommateConversation.create({ data: { matchId: match.id } });
    await closer.roommateConversationMember.createMany({
      data: [
        { conversationId: conversation.id, userId: first.id },
        { conversationId: conversation.id, userId: second.id }
      ]
    });

    let releaseClose!: () => void;
    let closeHasLock!: () => void;
    const closeLocked = new Promise<void>((resolve) => (closeHasLock = resolve));
    const release = new Promise<void>((resolve) => (releaseClose = resolve));
    const closing = closer.$transaction(async (transaction) => {
      await transaction.roommateMatch.update({ where: { id: match.id }, data: { status: "CLOSED" } });
      closeHasLock();
      await release;
    });
    await closeLocked;

    const service = new RoommateConversationsService(
      sender as never,
      { publish: async () => undefined },
      { consume: async () => undefined }
    );
    const sending = service
      .sendMessage(first.id, conversation.id, {
        clientMessageId: "008ae18c-7b57-4227-96f0-7cbd2d06f108",
        body: "Must serialize behind close"
      })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason })
      );

    const beforeRelease = await Promise.race([
      sending.then(() => "settled" as const),
      new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 100))
    ]);
    expect(beforeRelease).toBe("waiting");

    releaseClose();
    await closing;
    const outcome = await sending;
    expect(outcome).toMatchObject({ status: "rejected", reason: expect.any(BadRequestException) });
    expect(await sender.roommateMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
  });
});

