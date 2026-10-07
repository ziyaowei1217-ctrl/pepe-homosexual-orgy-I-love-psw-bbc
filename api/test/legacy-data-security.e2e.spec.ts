import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupsController } from "../src/groups/groups.controller";
import { GroupsService } from "../src/groups/groups.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { TripsController } from "../src/trips/trips.controller";
import { TripsService } from "../src/trips/trips.service";

const request = require("supertest") as (server: unknown) => any;

describe("ownerless legacy data endpoints", () => {
  let app: INestApplication | undefined;
  afterEach(async () => { await app?.close(); app = undefined; vi.unstubAllEnvs(); });

  it("retires production trips and groups before reading data", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const findMany = vi.fn(async () => [{ id: "private-record", members: [{ email: "private@example.test" }] }]);
    const module = await Test.createTestingModule({
      controllers: [GroupsController, TripsController],
      providers: [GroupsService, TripsService, { provide: PrismaService, useValue: { booking: { findMany }, group: { findMany } } }]
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    for (const [path, code] of [["trips", "LEGACY_TRIPS_RETIRED"], ["groups", "LEGACY_GROUPS_RETIRED"]]) {
      const response = await request(app.getHttpServer()).get(`/api/v1/${path}`).expect(410);
      expect(response.body.code).toBe(code);
      expect(JSON.stringify(response.body)).not.toContain("private-record");
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it("preserves the local demo contracts", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const findMany = vi.fn(async () => [{ id: "demo-record" }]);
    const prisma = { booking: { findMany }, group: { findMany } };
    await expect(new TripsService(prisma as never).findAll()).resolves.toEqual([{ id: "demo-record" }]);
    await expect(new GroupsService(prisma as never).findAll()).resolves.toEqual([{ id: "demo-record" }]);
  });
});
