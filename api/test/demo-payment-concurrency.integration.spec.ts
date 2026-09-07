import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApplicationsService } from '../src/applications/applications.service';
import { DemoPaymentsService } from '../src/demo-payments/demo-payments.service';
import { createDisposablePostgres } from './support/disposable-postgres';

const database = createDisposablePostgres('demo_payment_concurrency');
const describeDatabase = process.env.RUN_DB_SMOKE === '1' ? describe : describe.skip;
describeDatabase('concurrent demo payment commands on PostgreSQL', () => {
  let prisma: PrismaClient;
  let payments: DemoPaymentsService;
  let applications: ApplicationsService;
  beforeAll(async () => {
    database.create(); database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    payments = new DemoPaymentsService(prisma as never);
    applications = new ApplicationsService(prisma as never, payments);
    await prisma.user.createMany({ data: ['owner', 'renter'].map(id => ({ id, email: `${id}@payment-concurrency.example` })) });
  }, 30_000);
  afterAll(async () => { vi.useRealTimers(); await prisma?.$disconnect(); database.drop(); });

  it('records both simultaneous move-in confirmations and releases one ledger pair', async () => {
    const id = await accepted('concurrent-confirm');
    const held = await payments.simulateSuccess('renter', id, 'concurrent-confirm-payment');
    const concurrent = new DemoPaymentsService(synchronizeFirstReads('demoHeldFund') as never);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2099-09-20T12:00:00Z'));
    try {
      const outcomes = await Promise.allSettled([
        concurrent.confirmMoveIn('renter', held.heldFund!.id, 'concurrent-confirm-renter'),
        concurrent.confirmMoveIn('owner', held.heldFund!.id, 'concurrent-confirm-owner')
      ]);
      expect(outcomes.map(outcome => outcome.status === 'fulfilled' ? 'ok' : outcome.reason.code)).toEqual(['ok', 'ok']);
      const final = await payments.findByApplication('renter', id);
      expect(final.heldFund).toMatchObject({ status: 'RELEASED', renterConfirmedAt: expect.any(Date), ownerConfirmedAt: expect.any(Date) });
      expect(final.application.status).toBe('COMPLETED');
      expect(final.ledgerEntries.filter(entry => entry.event === 'RELEASE')).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ['success-same-key', 'success', true],
    ['success-different-keys', 'success', false],
    ['failure-same-key', 'failure', true]
  ] as const)('replays overlapping %s attempts without duplicate money movement', async (name, outcome, sameKey) => {
    const id = await accepted(name);
    const concurrent = new DemoPaymentsService(synchronizeFirstReads('demoPaymentAttempt') as never);
    const run = (key: string) => outcome === 'success'
      ? concurrent.simulateSuccess('renter', id, key)
      : concurrent.simulateFailure('renter', id, key);
    const outcomes = await Promise.allSettled([run(`${name}-attempt-1`), run(`${name}-attempt-${sameKey ? 1 : 2}`)]);
    expect(outcomes.map(result => result.status === 'fulfilled' ? 'ok' : result.reason.code)).toEqual(['ok', 'ok']);
    const final = await payments.findByApplication('renter', id);
    expect(final.payment.status).toBe(outcome === 'success' ? 'HELD' : 'AWAITING_ATTEMPT');
    expect(final.attempts).toHaveLength(sameKey ? 1 : 2);
    expect(final.attempts.filter(attempt => attempt.applied)).toHaveLength(outcome === 'success' ? 1 : 0);
    expect(final.ledgerEntries.filter(entry => entry.event === 'HOLD')).toHaveLength(outcome === 'success' ? 2 : 0);
  });

  function synchronizeFirstReads(model: 'demoHeldFund' | 'demoPaymentAttempt') {
    let reads = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    return new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== '$transaction') return Reflect.get(target, property, receiver);
        return (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(async transaction => {
          const delegate = transaction[model];
          const wrapped = new Proxy(delegate, {
            get(modelTarget, field, modelReceiver) {
              if (field !== 'findUnique') return Reflect.get(modelTarget, field, modelReceiver);
              return async (args: never) => {
                const result = model === 'demoHeldFund'
                  ? await transaction.demoHeldFund.findUnique(args)
                  : await transaction.demoPaymentAttempt.findUnique(args);
                if (reads < 2) { reads += 1; if (reads === 2) release(); await barrier; }
                return result;
              };
            }
          });
          return operation(new Proxy(transaction, { get(tx, field, txReceiver) { return field === model ? wrapped : Reflect.get(tx, field, txReceiver); } }));
        }, options);
      }
    });
  }
  async function accepted(id: string) {
    await prisma.listing.create({ data: {
      id, ownerId: 'owner', title: 'Concurrent payment fixture', area: 'Westwood', price: 1800, originalPrice: 1800,
      beds: 1, baths: 1, commute: '', transit: '', trust: '', tags: [], status: 'APPROVED',
      availableFrom: new Date('2099-01-01'), availableTo: new Date('2099-12-31')
    } });
    const draft = await applications.create('renter', `${id}-create`, {
      listingId: id, scope: 'SOLO', moveIn: '2099-09-20', moveOut: '2099-10-20',
      schoolOrOccupation: 'Test', incomeBand: 'TWO_TO_THREE_X', guarantorStatus: 'AVAILABLE', note: ''
    });
    await applications.submit('renter', draft.id, `${id}-submit`);
    await applications.accept('owner', draft.id, `${id}-accept`);
    return draft.id;
  }
});
