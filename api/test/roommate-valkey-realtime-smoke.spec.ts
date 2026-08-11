import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { type INestApplication, type Type, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createRoommateSocketAdapter,
  type RoommateSocketIoAdapter
} from "../src/roommate-conversations/socket-adapter";
import { createDisposablePostgres } from "./support/disposable-postgres";
import { closeOwnedNestLifecycle } from "./support/owned-nest-lifecycle";

const request = require("supertest") as (server: unknown) => any;

const runSmoke = process.env.RUN_DB_SMOKE === "1" && process.env.RUN_VALKEY_SMOKE === "1";
const runIsolatedChild = process.env.RUN_ROOMMATE_VALKEY_REALTIME_CHILD === "1";
const describeSmoke = runSmoke ? describe : describe.skip;
const ISOLATED_VALKEY_REALTIME_TIMEOUT_MS = 30_000;

type MessageCreatedEvent = {
  conversationId: string;
  message: { id: string; body: string; senderRole: "self" | "peer" };
};

type RunningInstance = {
  app: INestApplication;
  baseUrl: string;
};

type NestOwnership = {
  app?: INestApplication;
  module: TestingModule;
};

function defineTwoInstanceValkeySmoke() {
  const sockets = new Set<Socket>();
  const ownerships: NestOwnership[] = [];
  const adapters: RoommateSocketIoAdapter[] = [];
  const uniqueRunId = randomUUID();
  const userA = {
    id: `valkey-realtime-user-a-${uniqueRunId}`,
    email: `valkey-realtime-a-${uniqueRunId}@example.test`
  };
  const userB = {
    id: `valkey-realtime-user-b-${uniqueRunId}`,
    email: `valkey-realtime-b-${uniqueRunId}@example.test`
  };
  const profileA = { id: `valkey-realtime-profile-a-${uniqueRunId}`, name: "Valkey Realtime User A" };
  const profileB = { id: `valkey-realtime-profile-b-${uniqueRunId}`, name: "Valkey Realtime User B" };
  const originalEnvironment = {
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV
  };

  let instanceA: RunningInstance | undefined;
  let instanceB: RunningInstance | undefined;
  let tokenA = "";
  let tokenB = "";

  beforeAll(async () => {
    process.env.JWT_SECRET = "roommate-valkey-realtime-smoke-secret";
    process.env.NODE_ENV = "development";

    const { AppModule } = await import("../src/app.module");
    instanceA = await startApplication(AppModule, ownerships, adapters);
    instanceB = await startApplication(AppModule, ownerships, adapters);

    const prisma = instanceA.app.get(PrismaService);
    await prisma.user.createMany({ data: [userA, userB] });
    await prisma.roommateProfile.createMany({
      data: [
        roommateProfile(profileA.id, userA.id, profileA.name, 93),
        roommateProfile(profileB.id, userB.id, profileB.name, 94)
      ]
    });

    const jwt = instanceA.app.get(JwtService);
    [tokenA, tokenB] = await Promise.all(
      [userA, userB].map((user) => jwt.signAsync({ sub: user.id, email: user.email, role: "USER" }))
    );
  }, 20_000);

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    try {
      for (const socket of sockets) {
        try {
          socket.close();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      sockets.clear();

      const applicationResults = await Promise.allSettled(
        ownerships.map((ownership, index) =>
          settleWithin(
            closeOwnedNestLifecycle({ application: ownership.app, module: ownership.module }).catch((error) => {
              throw new Error(`Nest application ${index + 1} cleanup failed: ${describeError(error)}`);
            }),
            5_000,
            `Nest application ${index + 1} cleanup`
          )
        )
      );
      cleanupErrors.push(...rejectedReasons(applicationResults));

      const adapterResults = await Promise.allSettled(
        adapters.map((adapter, index) =>
          settleWithin(
            adapter.dispose().catch((error) => {
              throw new Error(`Valkey adapter ${index + 1} cleanup failed: ${describeError(error)}`);
            }),
            5_000,
            `Valkey adapter ${index + 1} cleanup`
          )
        )
      );
      cleanupErrors.push(...rejectedReasons(adapterResults));
    } finally {
      restoreEnvironment("JWT_SECRET", originalEnvironment.jwtSecret);
      restoreEnvironment("NODE_ENV", originalEnvironment.nodeEnv);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        `Two-instance Valkey smoke cleanup failed: ${cleanupErrors.map(describeError).join("; ")}`
      );
    }
  }, 15_000);

  it("delivers one committed message from instance A through instance B with distributed readiness", async () => {
    const httpA = request(instanceA!.app.getHttpServer());
    const httpB = request(instanceB!.app.getHttpServer());

    const [readyA, readyB] = await Promise.all([
      httpA.get("/api/v1/ready").expect(200),
      httpB.get("/api/v1/ready").expect(200)
    ]);
    expect(readyA.body.checks.realtime).toEqual({ status: "ok", mode: "distributed" });
    expect(readyB.body.checks.realtime).toEqual({ status: "ok", mode: "distributed" });

    await httpA
      .post(`/api/v1/roommates/${profileB.id}/actions`)
      .auth(tokenA, { type: "bearer" })
      .send({ action: "LIKE" })
      .expect(201);
    const reciprocal = await httpA
      .post(`/api/v1/roommates/${profileA.id}/actions`)
      .auth(tokenB, { type: "bearer" })
      .send({ action: "LIKE" })
      .expect(201);
    const conversationId = reciprocal.body.conversation.id as string;

    const [socketA, socketB] = await Promise.all([
      connectSocket(instanceA!.baseUrl, tokenA, sockets),
      connectSocket(instanceB!.baseUrl, tokenB, sockets)
    ]);
    expect(socketA.connected).toBe(true);
    expect(socketB.connected).toBe(true);

    const eventsForB: MessageCreatedEvent[] = [];
    const recordForB = (event: MessageCreatedEvent) => eventsForB.push(event);
    socketB.on("roommate.message.created", recordForB);
    try {
      const eventForB = onceEvent<MessageCreatedEvent>(socketB, "roommate.message.created");
      const committedRequest = httpA
        .post(`/api/v1/roommate-conversations/${conversationId}/messages`)
        .auth(tokenA, { type: "bearer" })
        .send({ clientMessageId: randomUUID(), body: "cross-instance Valkey message" })
        .expect(201);
      const [committed, deliveredToB] = await Promise.all([committedRequest, eventForB]);

      expect(deliveredToB).toMatchObject({
        conversationId,
        message: { id: committed.body.id, body: "cross-instance Valkey message", senderRole: "peer" }
      });
      await wait(250);
      expect(eventsForB).toEqual([
        expect.objectContaining({
          conversationId,
          message: expect.objectContaining({ id: committed.body.id })
        })
      ]);
    } finally {
      socketB.off("roommate.message.created", recordForB);
    }
  }, 10_000);
}

if (runIsolatedChild) {
  describeSmoke("roommate cross-instance realtime against real Valkey", defineTwoInstanceValkeySmoke);
} else {
  describeSmoke("isolated roommate cross-instance realtime against real Valkey", () => {
    const database = createDisposablePostgres("roommate_valkey_realtime");

    it(
      "runs two Nest instances and their shared Valkey adapter inside a killable child process",
      () => {
        let smokeError: unknown;
        try {
          database.create();
          database.migrateDeploy();
          runIsolatedValkeyRealtimeSmoke(database.databaseUrl);
        } catch (error) {
          smokeError = error;
        }

        try {
          database.drop();
        } catch (dropError) {
          if (smokeError) {
            throw new AggregateError(
              [smokeError, dropError],
              "Isolated Valkey realtime smoke and disposable database cleanup failed"
            );
          }
          throw dropError;
        }

        if (smokeError) throw smokeError;
      },
      ISOLATED_VALKEY_REALTIME_TIMEOUT_MS + 45_000
    );
  });
}

async function startApplication(
  AppModule: Type<unknown>,
  ownerships: NestOwnership[],
  adapters: RoommateSocketIoAdapter[]
): Promise<RunningInstance> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const ownership: NestOwnership = { module: moduleRef };
  ownerships.push(ownership);

  const app = moduleRef.createNestApplication({ forceCloseConnections: true });
  ownership.app = app;
  const health = app.get(MessagingInfrastructureHealth);
  const adapter = await createRoommateSocketAdapter(app, {
    valkeyUrl: process.env.VALKEY_URL,
    health
  });
  expect(adapter).toBeDefined();
  adapters.push(adapter!);
  app.useWebSocketAdapter(adapter!);
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
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

function runIsolatedValkeyRealtimeSmoke(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("vitest/vitest.mjs"),
      "run",
      "test/roommate-valkey-realtime-smoke.spec.ts",
      "--pool=threads",
      "--poolOptions.threads.singleThread"
    ],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        RUN_DB_SMOKE: "1",
        RUN_VALKEY_SMOKE: "1",
        RUN_ROOMMATE_VALKEY_REALTIME_CHILD: "1"
      },
      timeout: ISOLATED_VALKEY_REALTIME_TIMEOUT_MS,
      killSignal: "SIGKILL"
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `isolated Valkey realtime smoke failed: ${result.error?.message || result.stderr || result.stdout}`
    );
  }
}

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
      reject(new Error("Timed out connecting cross-instance roommate socket"));
    }, 2_000);
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
  return socket;
}

function settleWithin<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })
  ]);
}

function rejectedReasons(results: PromiseSettledResult<unknown>[]) {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
