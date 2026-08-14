import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthGuard } from "../src/auth/auth.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RoommateTeamsController } from "../src/roommate-teams/roommate-teams.controller";
import { RoommateTeamsService } from "../src/roommate-teams/roommate-teams.service";

const request = require("supertest") as (server: unknown) => any;

describe("roommate teams HTTP API", () => {
  let app: INestApplication;
  let token: string;
  let teams: ReturnType<typeof createRoommateTeamsStub>;

  beforeEach(async () => {
    teams = createRoommateTeamsStub();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "roommate-teams-http-secret" })],
      controllers: [RoommateTeamsController],
      providers: [
        AuthGuard,
        AuthenticatedUserService,
        { provide: RoommateTeamsService, useValue: teams },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async ({ where }: { where: { id: string } }) =>
                where.id === "user-a"
                  ? { id: "user-a", email: "user-a@example.test", role: "USER" }
                  : null
            }
          }
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    token = await app.get(JwtService).signAsync({ sub: "user-a" });
  });

  afterEach(async () => app.close());

  it("requires authentication for every team route", async () => {
    const http = request(app.getHttpServer());
    await http.get("/api/v1/roommate-teams/current").expect(401);
    await http.get("/api/v1/roommate-teams/invites").expect(401);
    await http.post("/api/v1/roommate-teams/invites").send({ roommateProfileId: "profile-b" }).expect(401);
    await http.post("/api/v1/roommate-teams/invites/invite-1/accept").expect(401);
    await http.post("/api/v1/roommate-teams/invites/invite-1/decline").expect(401);
    await http.post("/api/v1/roommate-teams/invites/invite-1/cancel").expect(401);
    await http.post("/api/v1/roommate-teams/current/leave").expect(401);
  });

  it("validates invite input and delegates the complete command surface with the authenticated user", async () => {
    const http = request(app.getHttpServer());

    await http
      .post("/api/v1/roommate-teams/invites")
      .auth(token, { type: "bearer" })
      .send({ roommateProfileId: "   " })
      .expect(400);
    await http
      .post("/api/v1/roommate-teams/invites")
      .auth(token, { type: "bearer" })
      .send({ roommateProfileId: "profile-b", unexpected: true })
      .expect(400);

    await http
      .post("/api/v1/roommate-teams/invites")
      .auth(token, { type: "bearer" })
      .send({ roommateProfileId: " profile-b " })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({ id: "invite-1", status: "PENDING" });
      });
    await http.get("/api/v1/roommate-teams/invites").auth(token, { type: "bearer" }).expect(200);
    await http.post("/api/v1/roommate-teams/invites/invite-1/accept").auth(token, { type: "bearer" }).expect(201);
    await http.post("/api/v1/roommate-teams/invites/invite-1/decline").auth(token, { type: "bearer" }).expect(201);
    await http.post("/api/v1/roommate-teams/invites/invite-1/cancel").auth(token, { type: "bearer" }).expect(201);
    await http.get("/api/v1/roommate-teams/current").auth(token, { type: "bearer" }).expect(200);
    await http.post("/api/v1/roommate-teams/current/leave").auth(token, { type: "bearer" }).expect(201);

    expect(teams.calls).toEqual([
      ["invite", "user-a", { roommateProfileId: "profile-b" }],
      ["listInvites", "user-a"],
      ["accept", "user-a", "invite-1"],
      ["decline", "user-a", "invite-1"],
      ["cancel", "user-a", "invite-1"],
      ["current", "user-a"],
      ["leave", "user-a"]
    ]);
  });
});

function createRoommateTeamsStub() {
  const service = {
    calls: [] as unknown[][],
    current: async (userId: string) => {
      service.calls.push(["current", userId]);
      return { id: "team-1", status: "ACTIVE", members: [] };
    },
    listInvites: async (userId: string) => {
      service.calls.push(["listInvites", userId]);
      return [{ id: "invite-1", status: "PENDING" }];
    },
    invite: async (userId: string, dto: { roommateProfileId: string }) => {
      service.calls.push(["invite", userId, dto]);
      return { id: "invite-1", status: "PENDING" };
    },
    accept: async (userId: string, inviteId: string) => {
      service.calls.push(["accept", userId, inviteId]);
      return { id: "team-1", status: "ACTIVE" };
    },
    decline: async (userId: string, inviteId: string) => {
      service.calls.push(["decline", userId, inviteId]);
      return { id: inviteId, status: "DECLINED" };
    },
    cancel: async (userId: string, inviteId: string) => {
      service.calls.push(["cancel", userId, inviteId]);
      return { id: inviteId, status: "CANCELLED" };
    },
    leave: async (userId: string) => {
      service.calls.push(["leave", userId]);
      return { id: "team-1", status: "DISSOLVED" };
    }
  };
  return service;
}
