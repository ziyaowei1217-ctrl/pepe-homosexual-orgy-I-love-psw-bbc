import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { Namespace } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureCors, getCorsOrigins } from "../src/config/cors";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { PrismaService } from "../src/prisma/prisma.service";
import { RoommateConversationGateway } from "../src/roommate-conversations/roommate-conversations.gateway";
import { createRoommateSocketAdapter } from "../src/roommate-conversations/socket-adapter";
import { createDisposablePostgres } from "./support/disposable-postgres";

const request = require("supertest") as (server: unknown) => any;

const runSmoke = process.env.RUN_DB_SMOKE === "1";
const describeSmoke = runSmoke ? describe : describe.skip;

type MessageCreatedEvent = {
  conversationId: string;
  message: { id: string; body: string; senderRole: "self" | "peer" };
};

type MessageReadEvent = {
  conversationId: string;
  self: { lastReadMessageId: string | null };
  peer: { lastReadMessageId: string | null };
};

describeSmoke("roommate realtime launch journey against real PostgreSQL", () => {
  const database = createDisposablePostgres("roommate_realtime");
  const sockets = new Set<Socket>();
  const originalEnvironment = {
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    valkeyUrl: process.env.VALKEY_URL
  };

  let app: INestApplication | undefined;
  let gateway: RoommateConversationGateway | undefined;
  let messagingInfrastructure: MessagingInfrastructureHealth | undefined;
  let prisma: PrismaService | undefined;
  let baseUrl = "";
  let tokenA = "";
  let tokenB = "";
  let tokenC = "";
  let databaseCreated = false;

  const userA = { id: "roommate-realtime-user-a", email: "roommate-realtime-a@example.test" };
  const userB = { id: "roommate-realtime-user-b", email: "roommate-realtime-b@example.test" };
  const userC = { id: "roommate-realtime-user-c", email: "roommate-realtime-c@example.test" };
  const profileA = { id: "roommate-realtime-profile-a", name: "Realtime User A" };
  const profileB = { id: "roommate-realtime-profile-b", name: "Realtime User B" };

  beforeAll(async () => {
    databaseCreated = true;
    database.create();
    database.migrateDeploy();

    process.env.DATABASE_URL = database.databaseUrl;
    process.env.JWT_SECRET = "roommate-realtime-smoke-secret";
    process.env.NODE_ENV = "development";
    delete process.env.VALKEY_URL;

    const { AppModule } = await import("../src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get(ConfigService);
    const activeMessagingInfrastructure = app.get(MessagingInfrastructureHealth);
    messagingInfrastructure = activeMessagingInfrastructure;
    activeMessagingInfrastructure.markDistributed("realtime");
    const socketAdapter = await createRoommateSocketAdapter(app, {
      valkeyUrl: config.get<string>("VALKEY_URL"),
      health: activeMessagingInfrastructure
    });
    if (socketAdapter) app.useWebSocketAdapter(socketAdapter);
    configureCors(app, getCorsOrigins(config.get<string>("WEB_ORIGIN")));
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    gateway = app.get(RoommateConversationGateway);
    const activePrisma = app.get(PrismaService);
    prisma = activePrisma;
    const jwt = app.get(JwtService);

    await activePrisma.user.createMany({ data: [userA, userB, userC] });
    await activePrisma.roommateProfile.createMany({
      data: [
        roommateProfile(profileA.id, userA.id, profileA.name, 93),
        roommateProfile(profileB.id, userB.id, profileB.name, 94)
      ]
    });

    [tokenA, tokenB, tokenC] = await Promise.all(
      [userA, userB, userC].map((user) =>
        jwt.signAsync({ sub: user.id, email: user.email, role: "USER" })
      )
    );
  }, 30_000);

  afterAll(async () => {
    try {
      for (const socket of sockets) socket.close();
      sockets.clear();
    } finally {
      try {
        if (app) await app.close();
      } finally {
        try {
          if (prisma) await prisma.$disconnect();
        } finally {
          try {
            if (databaseCreated) database.drop();
          } finally {
            restoreEnvironment("DATABASE_URL", originalEnvironment.databaseUrl);
            restoreEnvironment("JWT_SECRET", originalEnvironment.jwtSecret);
            restoreEnvironment("NODE_ENV", originalEnvironment.nodeEnv);
            restoreEnvironment("VALKEY_URL", originalEnvironment.valkeyUrl);
          }
        }
      }
    }
  }, 30_000);

  it("recovers offline messages, delivers committed realtime events once, and hides conversation existence", async () => {
    const http = request(app!.getHttpServer());
    expect(messagingInfrastructure!.snapshot().realtime).toEqual({ status: "ok", mode: "single-instance" });

    const firstLike = await http
      .post(`/api/v1/roommates/${profileB.id}/actions`)
      .auth(tokenA, { type: "bearer" })
      .send({ action: "LIKE" })
      .expect(201);
    expect(firstLike.body.conversation).toBeNull();

    const reciprocal = await http
      .post(`/api/v1/roommates/${profileA.id}/actions`)
      .auth(tokenB, { type: "bearer" })
      .send({ action: "LIKE" })
      .expect(201);
    const conversationId = reciprocal.body.conversation.id as string;

    const offline = await http
      .post(`/api/v1/roommate-conversations/${conversationId}/messages`)
      .auth(tokenA, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), body: "offline-client-message" })
      .expect(201);

    const inbox = await http
      .get("/api/v1/roommate-conversations")
      .auth(tokenB, { type: "bearer" })
      .expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ id: conversationId, unreadCount: 1 });

    const offlineHistory = await http
      .get(`/api/v1/roommate-conversations/${conversationId}/messages`)
      .auth(tokenB, { type: "bearer" })
      .expect(200);
    expect(offlineHistory.body.messages).toEqual([
      expect.objectContaining({ id: offline.body.id, body: "offline-client-message" })
    ]);

    const socketA = await connectSocket(baseUrl, tokenA, sockets);
    let socketB = await connectSocket(baseUrl, tokenB, sockets);
    await Promise.all([
      waitForSocketRoom(gateway!.server, userA.id),
      waitForSocketRoom(gateway!.server, userB.id)
    ]);

    const createdEventsForA: MessageCreatedEvent[] = [];
    const createdEventsForB: MessageCreatedEvent[] = [];
    const recordCreatedForA = (event: MessageCreatedEvent) => createdEventsForA.push(event);
    const recordCreatedForB = (event: MessageCreatedEvent) => createdEventsForB.push(event);
    socketA.on("roommate.message.created", recordCreatedForA);
    socketB.on("roommate.message.created", recordCreatedForB);
    const createdForA = onceEvent<MessageCreatedEvent>(socketA, "roommate.message.created");
    const createdForB = onceEvent<MessageCreatedEvent>(socketB, "roommate.message.created");
    const realtimeCommand = { clientMessageId: randomUUID(), body: "realtime-client-message" };
    const realtime = await http
      .post(`/api/v1/roommate-conversations/${conversationId}/messages`)
      .auth(tokenA, { type: "bearer" })
      .send(realtimeCommand)
      .expect(201);
    const [eventForA, eventForB] = await Promise.all([createdForA, createdForB]);
    expect(eventForA).toMatchObject({ conversationId, message: { id: realtime.body.id } });
    expect(eventForB).toMatchObject({ conversationId, message: { id: realtime.body.id } });

    const retried = await http
      .post(`/api/v1/roommate-conversations/${conversationId}/messages`)
      .auth(tokenA, { type: "bearer" })
      .send(realtimeCommand)
      .expect(201);
    expect(retried.body.id).toBe(realtime.body.id);

    const readForA = onceEvent<MessageReadEvent>(socketA, "roommate.message.read");
    const readForB = onceEvent<MessageReadEvent>(socketB, "roommate.message.read");
    await http
      .post(`/api/v1/roommate-conversations/${conversationId}/read`)
      .auth(tokenB, { type: "bearer" })
      .send({ lastReadMessageId: realtime.body.id })
      .expect(201);
    const [readEventForA] = await Promise.all([readForA, readForB]);
    expect(readEventForA).toMatchObject({
      conversationId,
      peer: { lastReadMessageId: realtime.body.id }
    });
    expect(createdEventsForA).toEqual([
      expect.objectContaining({ conversationId, message: expect.objectContaining({ id: realtime.body.id }) })
    ]);
    expect(createdEventsForB).toEqual([
      expect.objectContaining({ conversationId, message: expect.objectContaining({ id: realtime.body.id }) })
    ]);
    socketA.off("roommate.message.created", recordCreatedForA);
    socketB.off("roommate.message.created", recordCreatedForB);

    socketB.close();
    sockets.delete(socketB);
    await waitForSocketRoom(gateway!.server, userB.id, false);
    socketB = await connectSocket(baseUrl, tokenB, sockets);
    await waitForSocketRoom(gateway!.server, userB.id);
    const recovered = await http
      .get(`/api/v1/roommate-conversations/${conversationId}/messages`)
      .auth(tokenB, { type: "bearer" })
      .expect(200);
    expect(recovered.body.messages).toHaveLength(2);
    expect(new Set(recovered.body.messages.map((message: { id: string }) => message.id)).size).toBe(2);

    const inaccessible = await http
      .get(`/api/v1/roommate-conversations/${conversationId}/messages`)
      .auth(tokenC, { type: "bearer" })
      .expect(404);
    const missing = await http
      .get("/api/v1/roommate-conversations/missing-conversation/messages")
      .auth(tokenC, { type: "bearer" })
      .expect(404);
    expect(inaccessible.body).toEqual(missing.body);
    expect(missing.body).toMatchObject({
      statusCode: 404,
      message: "Roommate conversation not found"
    });
  }, 20_000);
});

function roommateProfile(id: string, ownerId: string, name: string, match: number) {
  return {
    id,
    ownerId,
    name,
    age: 25,
    role: "Launch smoke tester",
    image: `https://example.test/${id}.jpg`,
    match,
    budget: "$1,800/month",
    commute: "15 minutes",
    tags: ["verified", "quiet"]
  };
}

function onceEvent<T>(socket: Socket, event: string, timeoutMs = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    socket.once(event, onEvent);
  });
}

async function connectSocket(baseUrl: string, token: string, sockets: Set<Socket>) {
  const socket = io(`${baseUrl}/roommate-messaging`, {
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false
  });
  sockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out connecting roommate socket"));
    }, 2_000);
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
  return socket;
}

function waitForSocketRoom(
  namespace: Namespace,
  userId: string,
  expectedPresent = true,
  timeoutMs = 2_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (namespace.adapter.rooms.has(`user:${userId}`) === expectedPresent) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(
          new Error(
            `Timed out waiting for authenticated socket room for ${userId} to be ${expectedPresent ? "present" : "absent"}`
          )
        );
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
