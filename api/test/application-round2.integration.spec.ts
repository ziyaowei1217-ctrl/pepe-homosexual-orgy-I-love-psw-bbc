import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApplicationsService } from "../src/applications/applications.service";
import { DealThreadsService } from "../src/deal-threads/deal-threads.service";
import { DemoPaymentsService } from "../src/demo-payments/demo-payments.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const describeDatabase = process.env.RUN_DB_SMOKE === "1" ? describe : describe.skip;
const database = createDisposablePostgres("application_round2");

describeDatabase("application integrity and replay on PostgreSQL", () => {
  let prisma: PrismaClient;
  let applications: ApplicationsService;
  let threads: DealThreadsService;
  let fixtureNumber = 0;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    threads = new DealThreadsService(prisma as never);
    applications = new ApplicationsService(prisma as never, new DemoPaymentsService(prisma as never), threads);
    await prisma.user.createMany({ data: ["host", "renter", "teammate", "stranger"].map(id => ({ id, email: `${id}@round2.example` })) });
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    database.drop();
  });

  async function fixture() {
    const id = `fixture-${++fixtureNumber}`;
    await prisma.roommateTeamMember.updateMany({ data: { active: false } });
    await prisma.listing.create({ data: {
      id, ownerId: "host", title: "Approved listing", area: "Westwood", price: 1800, originalPrice: 1800,
      beds: 1, baths: 1, commute: "", transit: "", trust: "", tags: [], status: "APPROVED",
      availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-12-31")
    } });
    await prisma.roommateTeam.create({ data: { id, members: { create: [
      { userId: "renter", snapshot: { name: "Renter" } },
      { userId: "teammate", snapshot: { name: "Teammate" } }
    ] } } });
    const input = {
      listingId: id, scope: "TEAM" as const, teamId: id, moveIn: "2099-02-01", moveOut: "2099-03-01",
      schoolOrOccupation: "Student", incomeBand: "TWO_TO_THREE_X" as const,
      guarantorStatus: "AVAILABLE" as const, note: ""
    };
    return { id, input };
  }

  it("rejects creating a team application when the listing host is the other member", async () => {
    const { id, input } = await fixture();
    await prisma.roommateTeamMember.updateMany({ where: { teamId: id, userId: "teammate" }, data: { userId: "host" } });
    await expect(applications.create("renter", `${id}-create`, input)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.rentalApplication.count({ where: { listingId: id } })).toBe(0);
  });

  it.each(["submit", "accept"] as const)("rejects %s when the host joined the current team after the draft", async command => {
    const { id, input } = await fixture();
    const draft = await applications.create("renter", `${id}-create`, input);
    if (command === "accept") await applications.submit("renter", draft.id, `${id}-submit`);
    await prisma.roommateTeamMember.updateMany({ where: { teamId: id, userId: "teammate" }, data: { userId: "host" } });
    await expect(command === "submit"
      ? applications.submit("renter", draft.id, `${id}-submit`)
      : applications.accept("host", draft.id, `${id}-accept`)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.rentalApplication.findUniqueOrThrow({ where: { id: draft.id } })).status)
      .toBe(command === "submit" ? "DRAFT" : "SUBMITTED");
    expect(await prisma.demoPayment.count({ where: { applicationId: draft.id } })).toBe(0);
  });

  it.each(["submit", "accept"] as const)("rejects %s of a legacy application whose member snapshot includes the host", async command => {
    const { id, input } = await fixture();
    const draft = await applications.create("renter", `${id}-create`, input);
    await prisma.rentalApplication.update({ where: { id: draft.id }, data: {
      status: command === "submit" ? "DRAFT" : "SUBMITTED",
      memberSnapshots: [{ userId: "renter", displayName: "Renter" }, { userId: "host", displayName: "Host" }]
    } });
    await expect(command === "submit"
      ? applications.submit("renter", draft.id, `${id}-submit`)
      : applications.accept("host", draft.id, `${id}-accept`)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.demoPayment.count({ where: { applicationId: draft.id } })).toBe(0);
  });

  it("returns the successful submission and original thread after the listing enters review", async () => {
    const { id, input } = await fixture();
    const draft = await applications.create("renter", `${id}-create`, input);
    const submitted = await applications.submit("renter", draft.id, `${id}-submit`);
    const original = await prisma.dealThread.findUniqueOrThrow({ where: { ownerId_listingId: { ownerId: "renter", listingId: id } } });
    await prisma.listing.update({ where: { id }, data: { status: "SUBMITTED", title: "Unreviewed edit" } });

    await expect(applications.submit("renter", draft.id, `${id}-submit`)).resolves.toMatchObject({
      id: draft.id, status: "SUBMITTED", submittedAt: submitted.submittedAt
    });
    expect(await prisma.dealThread.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
    expect(await prisma.dealThread.count({ where: { listingId: id } })).toBe(1);
    await expect(applications.submit("stranger", draft.id, `${id}-submit`)).rejects.toBeInstanceOf(ConflictException);
    await expect(threads.createOrFindThread("stranger", { listingId: id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(threads.createOrFindThread("host", { listingId: id })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("persists submitted contact details and binds normalized contact values to the create key", async () => {
    const { id, input } = await fixture();
    const contact = { contactName: "  Application Contact  ", contactEmail: "  contact@example.com  " };
    const draft = await applications.create("renter", `${id}-create`, { ...input, ...contact });
    await applications.submit("renter", draft.id, `${id}-submit`);
    const expected = { contactName: "Application Contact", contactEmail: "contact@example.com" };
    expect(await prisma.rentalApplication.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject(expected);
    expect(await applications.findOne("host", draft.id)).toMatchObject(expected);
    expect((await applications.mine("renter")).find(row => row.id === draft.id)).toMatchObject(expected);
    expect((await applications.hostInbox("host")).find(row => row.id === draft.id)).toMatchObject(expected);
    await expect(applications.create("renter", `${id}-create`, { ...input, ...expected })).resolves.toMatchObject({ id: draft.id });
    await expect(applications.create("renter", `${id}-create`, { ...input, ...expected, contactName: "Changed" } as never))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(applications.create("renter", `${id}-create`, { ...input, ...expected, contactEmail: "changed@example.com" } as never))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps omitted and explicit-null contacts compatible with older create requests", async () => {
    const { id, input } = await fixture();
    const draft = await applications.create("renter", `${id}-create`, input);
    expect(draft).toMatchObject({ contactName: null, contactEmail: null });
    await expect(applications.create("renter", `${id}-create`, { ...input, contactName: null, contactEmail: null } as never))
      .resolves.toMatchObject({ id: draft.id });
  });
});
