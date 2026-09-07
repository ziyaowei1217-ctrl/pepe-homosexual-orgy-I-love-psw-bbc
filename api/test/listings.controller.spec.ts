import "reflect-metadata";
import { describe, expect, it } from "vitest";

import { AuditActor } from "../src/audit/audit.service";
import { AdminGuard } from "../src/auth/admin.guard";
import { AdminStepUpGuard } from "../src/auth/admin-step-up.guard";
import { AuthGuard, AuthenticatedRequest } from "../src/auth/auth.guard";
import { RequestWithId } from "../src/http/request-id";
import { AdminListingsController } from "../src/listings/admin-listings.controller";
import { ListingsController } from "../src/listings/listings.controller";

describe("ListingsController", () => {
  it("delegates public availability queries to ListingsService", async () => {
    const listings = createListingsServiceMock();
    const controller = new ListingsController(listings as never);
    const query = { moveIn: "2026-08-20", moveOut: "2026-09-20" };

    await expect(controller.findAll(query)).resolves.toEqual([{ id: "listing-1" }]);
    expect(listings.findAllCalls).toEqual([query]);
  });

  it("delegates current-user listing reads to ListingsService", async () => {
    const listings = createListingsServiceMock();
    const controller = new ListingsController(listings as never);

    await expect(controller.findMine(requestFor("owner-1"))).resolves.toEqual([{ id: "listing-1" }]);
    expect(listings.findMineCalls).toEqual(["owner-1"]);
  });

  it("delegates listing submission to ListingsService", async () => {
    const listings = createListingsServiceMock();
    const controller = new ListingsController(listings as never);

    await expect(controller.submit(requestFor("owner-1"), "listing-1")).resolves.toEqual({ id: "listing-1" });
    expect(listings.submitCalls).toEqual([{ ownerId: "owner-1", id: "listing-1" }]);
  });

});

describe("AdminListingsController", () => {
  it("pins class-level authentication and administrator guards", () => {
    expect(guardsFor(AdminListingsController)).toEqual([AuthGuard, AdminGuard]);
  });

  it("requires administrator step-up for writes but not review queue reads", () => {
    expect(guardsFor(AdminListingsController.prototype.findReviewQueue)).not.toContain(AdminStepUpGuard);
    expect(guardsFor(AdminListingsController.prototype.approve)).toContain(AdminStepUpGuard);
    expect(guardsFor(AdminListingsController.prototype.reject)).toContain(AdminStepUpGuard);
  });

  it("delegates review queue reads to ListingsService", async () => {
    const listings = createListingsServiceMock();
    const controller = new AdminListingsController(listings as never);

    await expect(controller.findReviewQueue()).resolves.toEqual([{ id: "submitted-1" }]);
    expect(listings.findReviewQueueCalls).toBe(1);
  });

  it("delegates approvals with the authenticated request audit actor", async () => {
    const listings = createListingsServiceMock();
    const controller = new AdminListingsController(listings as never);

    await expect(controller.approve(requestFor("admin-1", "ADMIN"), "listing-1", { revision: 4 })).resolves.toEqual({ id: "listing-1" });
    expect(listings.approveCalls).toEqual([
      {
        id: "listing-1",
        revision: 4,
        actor: {
          actorType: "USER",
          actorUserId: "admin-1",
          actorEmail: "admin-1@example.com",
          requestId: "request-1"
        }
      }
    ]);
  });

  it("delegates rejections with the authenticated request audit actor and reason", async () => {
    const listings = createListingsServiceMock();
    const controller = new AdminListingsController(listings as never);

    await expect(
      controller.reject(requestFor("admin-1", "ADMIN"), "listing-1", { reason: "Please add clearer bedroom photos", revision: 4 })
    ).resolves.toEqual({ id: "listing-1" });
    expect(listings.rejectCalls).toEqual([
      {
        id: "listing-1",
        revision: 4,
        actor: {
          actorType: "USER",
          actorUserId: "admin-1",
          actorEmail: "admin-1@example.com",
          requestId: "request-1"
        },
        reason: "Please add clearer bedroom photos"
      }
    ]);
  });
});

function guardsFor(target: object) {
  return (Reflect.getMetadata("__guards__", target) ?? []) as unknown[];
}

function requestFor(id: string, role = "USER"): AuthenticatedRequest & RequestWithId {
  return {
    headers: {},
    requestId: "request-1",
    user: {
      id,
      email: `${id}@example.com`,
      role
    }
  };
}

function createListingsServiceMock() {
  const service = {
    findAllCalls: [] as Array<{ moveIn?: string; moveOut?: string }>,
    findMineCalls: [] as string[],
    submitCalls: [] as Array<{ ownerId: string; id: string }>,
    findReviewQueueCalls: 0,
    approveCalls: [] as Array<{ id: string; actor: AuditActor; revision: number }>,
    rejectCalls: [] as Array<{ id: string; actor: AuditActor; reason: string; revision: number }>,
    findAll: async (query: { moveIn?: string; moveOut?: string }) => {
      service.findAllCalls.push(query);
      return [{ id: "listing-1" }];
    },
    findMine: async (ownerId: string) => {
      service.findMineCalls.push(ownerId);
      return [{ id: "listing-1" }];
    },
    submit: async (ownerId: string, id: string) => {
      service.submitCalls.push({ ownerId, id });
      return { id };
    },
    findReviewQueue: async () => {
      service.findReviewQueueCalls += 1;
      return [{ id: "submitted-1" }];
    },
    approve: async (id: string, actor: AuditActor, revision: number) => {
      service.approveCalls.push({ id, actor, revision });
      return { id };
    },
    reject: async (id: string, actor: AuditActor, reason: string, revision: number) => {
      service.rejectCalls.push({ id, actor, reason, revision });
      return { id };
    }
  };

  return service;
}
