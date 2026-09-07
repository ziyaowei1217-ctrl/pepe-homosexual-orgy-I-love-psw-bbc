import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApplicationsService } from '../src/applications/applications.service';
import { DemoPaymentsService } from '../src/demo-payments/demo-payments.service';
import { createDisposablePostgres } from './support/disposable-postgres';

const database = createDisposablePostgres('demo_payment_business_date');
const describeDatabase = process.env.RUN_DB_SMOKE === '1' ? describe : describe.skip;

describeDatabase('demo move-in dates on PostgreSQL', () => {
  let prisma: PrismaClient;
  let applications: ApplicationsService;
  let payments: DemoPaymentsService;
  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    payments = new DemoPaymentsService(prisma as never);
    applications = new ApplicationsService(prisma as never, payments);
    await prisma.user.createMany({ data: [
      { id: 'owner', email: 'owner@business-date.example' },
      { id: 'renter', email: 'renter@business-date.example' }
    ] });
  }, 30_000);
  afterAll(async () => { vi.useRealTimers(); await prisma?.$disconnect(); database.drop(); });

  it.each([
    ['summer', '2099-09-20', '2099-09-20T01:00:00.000Z', '2099-09-20T07:00:00.000Z'],
    ['winter', '2099-01-20', '2099-01-20T07:59:59.999Z', '2099-01-20T08:00:00.000Z']
  ])('rejects early confirmation in %s and releases at LA midnight', async (name, moveIn, before, midnight) => {
    const id = await accepted(`${name}-confirm`, moveIn);
    const controlId = await accepted(`${name}-cancel`, moveIn);
    const held = await payments.simulateSuccess('renter', id, `${name}-payment`);
    await payments.simulateSuccess('renter', controlId, `${name}-control-payment`);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(before));
      for (const actor of ['renter', 'owner']) {
        await expect(payments.confirmMoveIn(actor, held.heldFund!.id, `${name}-${actor}-confirmation`))
          .rejects.toThrow('约定入住日期前不能确认入住');
      }
      const unchanged = await payments.findByApplication('renter', id);
      expect(unchanged.heldFund).toMatchObject({ status: 'HELD', renterConfirmedAt: null, ownerConfirmedAt: null });
      expect(unchanged.application.status).toBe('ACCEPTED');
      expect(unchanged.ledgerEntries.filter(entry => entry.event === 'RELEASE')).toHaveLength(0);
      await expect(applications.cancel('renter', controlId, `${name}-cancel`, { reason: 'Before move in' }))
        .resolves.toMatchObject({ status: 'CANCELLED' });
      vi.setSystemTime(new Date(midnight));
      await payments.confirmMoveIn('renter', held.heldFund!.id, `${name}-renter-confirmation`);
      const released = await payments.confirmMoveIn('owner', held.heldFund!.id, `${name}-owner-confirmation`);
      expect(released.payment.status).toBe('RELEASED');
      expect(released.application.status).toBe('COMPLETED');
      expect(released.ledgerEntries.filter(entry => entry.event === 'RELEASE')).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  async function accepted(id: string, moveIn: string) {
    await prisma.listing.create({ data: {
      id, ownerId: 'owner', title: 'Business date fixture', area: 'Westwood',
      price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: '', transit: '', trust: '', tags: [],
      availableFrom: new Date('2099-01-01'), availableTo: new Date('2099-12-31'), status: 'APPROVED'
    } });
    const draft = await applications.create('renter', `${id}-create`, {
      listingId: id, scope: 'SOLO', moveIn, moveOut: '2099-12-31',
      schoolOrOccupation: 'Test', incomeBand: 'TWO_TO_THREE_X', guarantorStatus: 'AVAILABLE', note: ''
    });
    await applications.submit('renter', draft.id, `${id}-submit`);
    await applications.accept('owner', draft.id, `${id}-accept`);
    return draft.id;
  }
});
