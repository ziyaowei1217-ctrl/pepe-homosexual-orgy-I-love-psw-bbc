import 'reflect-metadata';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuthGuard } from '../src/auth/auth.guard';
import { ApplicationsController } from '../src/applications/applications.controller';
import { ApplicationsService } from '../src/applications/applications.service';
import { DealThreadsService } from '../src/deal-threads/deal-threads.service';
import { DemoPaymentsService } from '../src/demo-payments/demo-payments.service';
import { ListingsController } from '../src/listings/listings.controller';
import { ListingsService } from '../src/listings/listings.service';
import { createDisposablePostgres } from './support/disposable-postgres';

const request = createRequire(resolve(__dirname, '../package.json'))('supertest');
const database = createDisposablePostgres('application_round6');
const describeDatabase = process.env.RUN_DB_SMOKE === '1' ? describe : describe.skip;

describeDatabase('application completion and concurrent command recovery on PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let currentApplications: ApplicationsService;
  let ordinaryApplications: ApplicationsService;
  let payments: DemoPaymentsService;
  let threads: DealThreadsService;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    payments = new DemoPaymentsService(prisma as never);
    threads = new DealThreadsService(prisma as never);
    ordinaryApplications = new ApplicationsService(prisma as never, payments, threads);
    currentApplications = ordinaryApplications;
    await prisma.user.createMany({ data: ['renter', 'host', 'stranger'].map(id => ({ id, email: `${id}@audit6-applications.example` })) });
    await prisma.profile.create({ data: { email: 'host@audit6-applications.example', displayName: 'Host', school: 'UCLA', city: 'Los Angeles', role: 'lister' } });
    const controllerDelegate = new Proxy({}, {
      get(_target, property) {
        const value = Reflect.get(currentApplications, property);
        return typeof value === 'function' ? value.bind(currentApplications) : value;
      }
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [ApplicationsController, ListingsController],
      providers: [
        { provide: ApplicationsService, useValue: controllerDelegate },
        { provide: ListingsService, useValue: new ListingsService(prisma as never, { append: async () => {} } as never) }
      ]
    }).overrideGuard(AuthGuard).useValue({
      canActivate(context: any) {
        const http = context.switchToHttp().getRequest();
        // Fixed authenticated fixture actors. Authentication itself is out of scope.
        const id = String(http.headers['x-audit-user'] ?? 'renter');
        http.user = { id, email: `${id}@audit6-applications.example`, role: 'USER' };
        return true;
      }
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); database.drop(); });

  it('completes the first application conversation after a legal availability PATCH enters review', async () => {
    const listingId = await listing('missing-thread');
    const draft = await ordinaryApplications.create('renter', 'audit6-missing-thread-create', input(listingId));
    const pause = gate();
    let firstRead = true;
    const delayedThreads = new DealThreadsService(new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== 'dealThread') return Reflect.get(target, property, receiver);
        return new Proxy(target.dealThread, {
          get(delegate, field, delegateReceiver) {
            if (field !== 'findUnique') return Reflect.get(delegate, field, delegateReceiver);
            return async (args: never) => {
              const result = await delegate.findUnique(args);
              if (firstRead) { firstRead = false; pause.enter(); await pause.resume; }
              return result;
            };
          }
        });
      }
    }) as never);
    currentApplications = new ApplicationsService(prisma as never, payments, delayedThreads);
    const firstSubmit = post(`/applications/${draft.id}/submit`, 'audit6-missing-thread-submit').then((response: any) => response);
    await pause.entered;
    expect(await prisma.rentalApplication.findUnique({ where: { id: draft.id } })).toMatchObject({ status: 'SUBMITTED', submitKey: 'audit6-missing-thread-submit' });
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(0);
    const changed = await request(app.getHttpServer()).patch(`/api/v1/listings/${listingId}`).set('x-audit-user', 'host')
      .send({ availableFrom: '2099-01-15', availableTo: '2099-12-31' });
    pause.release();
    expect(changed.status).toBe(200);
    expect(changed.body.status).toBe('SUBMITTED');
    const first = await firstSubmit;
    currentApplications = ordinaryApplications; // No pause or injected error on retries.
    const retries = [];
    for (let attempt = 0; attempt < 2; attempt += 1) retries.push(await post(`/applications/${draft.id}/submit`, 'audit6-missing-thread-submit'));
    expect(first.status).toBe(201);
    expect(retries.map(result => result.status)).toEqual([201, 201]);
    const freshKey = await post(`/applications/${draft.id}/submit`, 'audit6-missing-thread-fresh');
    expect(freshKey.status).toBe(409);
    expect(await ordinaryApplications.findOne('renter', draft.id)).toMatchObject({ status: 'SUBMITTED' });
    expect(await prisma.dealThread.findMany({ where: { listingId } })).toMatchObject([
      { ownerId: 'renter', listingOwnerId: 'host', listingId }
    ]);
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(1);
    // A recorded submission authorizes recovery, not a new public conversation.
    await expect(threads.createOrFindThread('stranger', { listingId })).rejects.toMatchObject({ status: 404 });
    await expect(threads.createOrFindThread('host', { listingId })).rejects.toMatchObject({ status: 404 });
    expect((await post(`/applications/${draft.id}/submit`, 'audit6-missing-thread-submit', {}, 'stranger')).status).toBe(409);
  });

  it('retries the missing conversation from a persisted submission after a transient failure and a legal status change', async () => {
    const listingId = await listing('thread-retry');
    const draft = await ordinaryApplications.create('renter', 'thread-retry-create', input(listingId));
    let failRead = true;
    const recoveringThreads = new DealThreadsService(new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== 'dealThread') return Reflect.get(target, property, receiver);
        return new Proxy(target.dealThread, {
          get(delegate, field, delegateReceiver) {
            if (field !== 'findUnique') return Reflect.get(delegate, field, delegateReceiver);
            return async (args: never) => {
              if (failRead) { failRead = false; throw new Error('Transient conversation dependency failure'); }
              return delegate.findUnique(args);
            };
          }
        });
      }
    }) as never);
    currentApplications = new ApplicationsService(prisma as never, payments, recoveringThreads);
    expect((await post(`/applications/${draft.id}/submit`, 'thread-retry-submit')).status).toBe(500);
    expect(await prisma.rentalApplication.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: 'SUBMITTED' });
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(0);
    expect((await request(app.getHttpServer()).patch(`/api/v1/listings/${listingId}`).set('x-audit-user', 'host')
      .send({ availableFrom: '2099-01-15', availableTo: '2099-12-31' })).status).toBe(200);
    currentApplications = ordinaryApplications;
    expect((await post(`/applications/${draft.id}/submit`, 'thread-retry-submit')).status).toBe(201);
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(1);
  });

  it('does not authorize a missing conversation from a withdrawn draft, another actor, or a changed owner', async () => {
    const listingId = await listing('thread-authorization');
    const draft = await ordinaryApplications.create('renter', 'thread-authorization-create', input(listingId));
    await ordinaryApplications.withdraw('renter', draft.id, 'thread-authorization-withdraw');
    await prisma.listing.update({ where: { id: listingId }, data: { status: 'SUBMITTED' } });
    await expect(threads.createOrFindApplicationThread('renter', draft.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(0);

    const submittedListing = await listing('thread-owner-change');
    const submitted = await ordinaryApplications.create('renter', 'thread-owner-create', input(submittedListing));
    // Existing persisted submission markers, with its conversation absent as in interrupted completion.
    await prisma.rentalApplication.update({ where: { id: submitted.id }, data: {
      status: 'SUBMITTED', submitKey: 'thread-owner-submit', submittedAt: new Date()
    } });
    await expect(threads.createOrFindApplicationThread('stranger', submitted.id)).rejects.toMatchObject({ status: 404 });
    await prisma.listing.update({ where: { id: submittedListing }, data: { ownerId: 'stranger' } });
    await expect(threads.createOrFindApplicationThread('renter', submitted.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.dealThread.count({ where: { listingId: submittedListing } })).toBe(0);
  });

  it('completes the original authorized conversation after a submitted application is withdrawn', async () => {
    const listingId = await listing('historical-submission');
    const draft = await ordinaryApplications.create('renter', 'historical-create', input(listingId));
    // Complete the real submission with the conversation dependency unavailable, then withdraw it.
    const interrupted = new ApplicationsService(prisma as never, payments, {
      createOrFindApplicationThread: async () => { throw new Error('Conversation temporarily unavailable'); }
    } as never);
    await expect(interrupted.submit('renter', draft.id, 'historical-submit')).rejects.toThrow('Conversation temporarily unavailable');
    await ordinaryApplications.withdraw('renter', draft.id, 'historical-withdraw');
    await prisma.listing.update({ where: { id: listingId }, data: { status: 'SUBMITTED' } });
    await expect(ordinaryApplications.submit('renter', draft.id, 'historical-submit')).resolves.toMatchObject({ status: 'WITHDRAWN' });
    expect(await prisma.dealThread.findMany({ where: { listingId } })).toMatchObject([{ ownerId: 'renter', listingOwnerId: 'host' }]);
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(1);
  });

  it('converges concurrent missing-conversation recovery after both reads find no thread', async () => {
    const listingId = await listing('thread-completion-overlap');
    const draft = await ordinaryApplications.create('renter', 'thread-completion-create', input(listingId));
    const interrupted = new ApplicationsService(prisma as never, payments, {
      createOrFindApplicationThread: async () => { throw new Error('Conversation temporarily unavailable'); }
    } as never);
    await expect(interrupted.submit('renter', draft.id, 'thread-completion-submit')).rejects.toThrow('Conversation temporarily unavailable');
    let reads = 0;
    const pause = gate();
    const errors: string[] = [];
    const concurrentThreads = new DealThreadsService(new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== 'dealThread') return Reflect.get(target, property, receiver);
        return new Proxy(target.dealThread, {
          get(delegate, field, delegateReceiver) {
            if (field === 'findUnique') return async (args: never) => {
              const result = await delegate.findUnique(args);
              if (!result && ++reads <= 2) {
                if (reads === 2) pause.release();
                await pause.resume;
              }
              return result;
            };
            if (field === 'create') return async (args: never) => {
              try { return await delegate.create(args); }
              catch (error: any) { errors.push(error.code); throw error; }
            };
            return Reflect.get(delegate, field, delegateReceiver);
          }
        });
      }
    }) as never);
    const service = new ApplicationsService(prisma as never, payments, concurrentThreads);
    const results = await Promise.all([
      service.submit('renter', draft.id, 'thread-completion-submit'),
      service.submit('renter', draft.id, 'thread-completion-submit')
    ]);
    expect(results.map(result => result.id)).toEqual([draft.id, draft.id]);
    expect(errors).toEqual(['P2002']);
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(1);
  });

  it('controls for the prior-round fixed case: an existing thread permits submit replay after the same availability PATCH', async () => {
    currentApplications = ordinaryApplications;
    const listingId = await listing('existing-thread-control');
    const draft = await ordinaryApplications.create('renter', 'audit6-existing-thread-create', input(listingId));
    expect((await post(`/applications/${draft.id}/submit`, 'audit6-existing-thread-submit')).status).toBe(201);
    const changed = await request(app.getHttpServer()).patch(`/api/v1/listings/${listingId}`).set('x-audit-user', 'host')
      .send({ availableFrom: '2099-01-15', availableTo: '2099-12-31' });
    expect(changed.status).toBe(200);
    const replay = await post(`/applications/${draft.id}/submit`, 'audit6-existing-thread-submit');
    expect(replay.status).toBe(201);
    expect(await prisma.dealThread.count({ where: { listingId } })).toBe(1);
  });

  it.each(['create', 'submit', 'accept', 'reject'] as const)('observes two identical concurrent %s commands using real Serializable transactions', async operation => {
    currentApplications = ordinaryApplications;
    const listingId = await listing(`concurrent-${operation}`);
    let id: string | undefined;
    if (operation !== 'create') {
      const draft = await ordinaryApplications.create('renter', `audit6-${operation}-create`, input(listingId));
      id = draft.id;
      if (operation === 'accept' || operation === 'reject') await ordinaryApplications.submit('renter', id!, `audit6-${operation}-submit`);
    }
    const observed = gateTransactions(operation === 'create' ? 'listing' : 'rentalApplication');
    currentApplications = new ApplicationsService(observed.client as never, payments, threads);
    const path = operation === 'create' ? '/applications' : `/applications/${id}/${operation}`;
    const body = operation === 'create' ? input(listingId) : operation === 'reject' ? { reason: 'Another applicant chosen' } : {};
    const actor = operation === 'accept' || operation === 'reject' ? 'host' : 'renter';
    const key = `audit6-${operation}-overlap`;
    const responses = await Promise.all([post(path, key, body, actor), post(path, key, body, actor)]);
    currentApplications = ordinaryApplications;
    const replay = await post(path, key, body, actor);
    const saved = await prisma.rentalApplication.findMany({ where: { listingId } });
    expect(saved).toHaveLength(1);
    expect(replay.status).toBe(201);
    const statuses = responses.map(response => response.status).sort();
    expect(statuses).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    const expectedStatus = { create: 'DRAFT', submit: 'SUBMITTED', accept: 'ACCEPTED', reject: 'REJECTED' }[operation];
    expect(saved[0].status).toBe(expectedStatus);
    expect(await prisma.demoPayment.count({ where: { applicationId: saved[0].id } })).toBe(operation === 'accept' ? 1 : 0);
    if (operation !== 'create') expect(observed.errors).toContain('P2034');
    expect((await post(path, key, body, 'stranger')).status).toBe(409);
    if (operation === 'accept' || operation === 'reject') {
      expect((await post(path, key, { reason: 'Changed decision payload' }, actor)).status).toBe(409);
    }
  });

  it.each(['accept', 'reject'] as const)('keeps concurrent conflicting %s payloads distinct after a real serialization failure', async operation => {
    currentApplications = ordinaryApplications;
    const listingId = await listing(`different-payload-${operation}`);
    const draft = await ordinaryApplications.create('renter', `different-${operation}-create`, input(listingId));
    await ordinaryApplications.submit('renter', draft.id, `different-${operation}-submit`);
    const observed = gateTransactions('rentalApplication');
    currentApplications = new ApplicationsService(observed.client as never, payments, threads);
    const key = `different-${operation}-decision`;
    const responses = await Promise.all(['First reason', 'Second reason'].map(reason =>
      post(`/applications/${draft.id}/${operation}`, key, { reason }, 'host')));
    currentApplications = ordinaryApplications;
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(observed.errors).toContain('P2034');
    const saved = await prisma.rentalApplication.findUniqueOrThrow({ where: { id: draft.id } });
    expect(saved.decisionReason).toBe(responses.find(response => response.status === 201).body.decisionReason);
    expect(await prisma.demoPayment.count({ where: { applicationId: draft.id } })).toBe(operation === 'accept' ? 1 : 0);
  });

  function gateTransactions(model: 'listing' | 'rentalApplication') {
    const errors: string[] = [];
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolveBarrier => { release = resolveBarrier; });
    const client = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== '$transaction') return Reflect.get(target, property, receiver);
        return (callback: (transaction: Prisma.TransactionClient) => Promise<unknown>, options: any) => target.$transaction(async transaction => {
          let firstRead = true;
          const wrapped = new Proxy(transaction[model], {
            get(delegate, field, delegateReceiver) {
              if (field !== 'findUnique') return Reflect.get(delegate, field, delegateReceiver);
              return async (args: never) => {
                const result = model === 'listing'
                  ? await transaction.listing.findUnique(args)
                  : await transaction.rentalApplication.findUnique(args);
                if (firstRead) {
                  firstRead = false;
                  arrivals += 1;
                  if (arrivals === 2) release();
                  await barrier;
                }
                return result;
              };
            }
          });
          return callback(new Proxy(transaction, { get(tx, field, txReceiver) { return field === model ? wrapped : Reflect.get(tx, field, txReceiver); } }));
        }, options).catch(error => { errors.push(error.code ?? error.name); throw error; });
      }
    });
    return { client, errors };
  }

  async function listing(id: string) {
    await prisma.listing.create({ data: { id, ownerId: 'host', title: 'Audit6 application fixture', area: 'Westwood', price: 1800, originalPrice: 1800,
      beds: 1, baths: 1, commute: '', transit: '', trust: '', tags: [], status: 'APPROVED',
      availableFrom: new Date('2099-01-01'), availableTo: new Date('2099-12-31') } });
    return id;
  }
  function input(listingId: string) {
    return { listingId, scope: 'SOLO' as const, moveIn: '2099-09-20', moveOut: '2099-10-20', schoolOrOccupation: 'UCLA',
      incomeBand: 'TWO_TO_THREE_X' as const, guarantorStatus: 'AVAILABLE' as const, note: '' };
  }
  function post(path: string, key: string, body: object = {}, actor = 'renter') {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('x-audit-user', actor).set('Idempotency-Key', key).send(body);
  }
});

function gate() {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolveGate => { enter = resolveGate; });
  const resume = new Promise<void>(resolveGate => { release = resolveGate; });
  return { entered, enter, resume, release };
}
