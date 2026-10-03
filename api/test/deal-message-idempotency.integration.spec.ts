import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DealThreadsService } from '../src/deal-threads/deal-threads.service';
import { LocalRoommateMessageRateLimiter } from '../src/roommate-conversations/roommate-message-rate-limit';
import { createDisposablePostgres } from './support/disposable-postgres';

const database = createDisposablePostgres('deal_message_idempotency');
const describeDatabase = process.env.RUN_DB_SMOKE === '1' ? describe : describe.skip;

describeDatabase('deal message operation identities on disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: DealThreadsService;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    service = new DealThreadsService(prisma as never);
    await prisma.user.createMany({ data: ['renter', 'host', 'outsider'].map(id => ({ id, email: `${id}@deal-idempotency.example` })) });
  }, 30_000);
  afterAll(async () => { await prisma?.$disconnect(); database.drop(); });

  it('replays a committed message after its response reload fails, including across service recreation', async () => {
    const threadId = await thread('lost-response');
    let reads = 0;
    const interrupted = new DealThreadsService(new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== 'dealThread') return Reflect.get(target, property, receiver);
        return new Proxy(target.dealThread, {
          get(delegate, field, delegateReceiver) {
            if (field !== 'findFirst') return Reflect.get(delegate, field, delegateReceiver);
            return (args: never) => {
              if (++reads === 2) throw new Error('response reload failed after commit');
              return delegate.findFirst(args);
            };
          }
        });
      }
    }) as never);
    const command = { clientMessageId: randomUUID(), body: 'Can I view this Friday?' };
    await expect(interrupted.sendMessage('renter', threadId, command)).rejects.toThrow('response reload failed after commit');
    expect(await prisma.dealMessage.count({ where: { threadId } })).toBe(1);
    const restarted = new DealThreadsService(prisma as never);
    const replay = await restarted.sendMessage('renter', threadId, command);
    expect(replay.messages).toHaveLength(1);
    expect(await prisma.dealMessage.count({ where: { threadId } })).toBe(1);
  });

  it('resolves overlapping same-key requests to one committed message', async () => {
    const threadId = await thread('concurrent');
    const command = { clientMessageId: randomUUID(), body: 'Friday works.' };
    const results = await Promise.all(Array.from({ length: 8 }, () => service.sendMessage('host', threadId, command)));
    expect(await prisma.dealMessage.count({ where: { threadId } })).toBe(1);
    expect(new Set(results.map(result => result.messages[0].id)).size).toBe(1);
    expect(results.every(result => result.messages.length === 1)).toBe(true);
  });

  it('rejects an operation reused for another body or thread, without leaking to outsiders', async () => {
    const firstThread = await thread('bound-first');
    const secondThread = await thread('bound-second');
    const command = { clientMessageId: randomUUID(), body: 'Original message' };
    const original = await service.sendMessage('renter', firstThread, command);
    await expect(service.sendMessage('renter', firstThread, { ...command, body: 'Changed message' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.sendMessage('renter', secondThread, command)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.sendMessage('outsider', firstThread, command)).rejects.toBeInstanceOf(NotFoundException);
    const replay = await service.sendMessage('renter', firstThread, { ...command, body: '  Original message  ' });
    expect(replay.messages.map((message: { id: string }) => message.id)).toEqual(original.messages.map((message: { id: string }) => message.id));
    expect(await prisma.dealMessage.count({ where: { threadId: secondThread } })).toBe(0);
  });

  it('accepts a key independently per sender and new operations with identical body', async () => {
    const threadId = await thread('sender-scope');
    const command = { clientMessageId: randomUUID(), body: 'Thanks' };
    await service.sendMessage('renter', threadId, command);
    await service.sendMessage('host', threadId, command);
    const result = await service.sendMessage('renter', threadId, { ...command, clientMessageId: randomUUID() });
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((message: { align: string }) => message.align)).toEqual(['right', 'left', 'right']);
  });

  it('allows old and server-generated messages without an operation identity', async () => {
    const threadId = await thread('legacy');
    await prisma.dealMessage.createMany({ data: [1, 2].map(index => ({ threadId, senderId: 'renter', senderName: 'Renter', body: `Legacy ${index}` })) });
    await prisma.dealMessage.createMany({ data: [1, 2].map(index => ({ threadId, senderName: 'System', body: `Viewing event ${index}` })) });
    expect(await prisma.dealMessage.count({ where: { threadId } })).toBe(4);
  });

  it('permits exactly one payload when different bodies race with the same key', async () => {
    const threadId = await thread('conflicting-race');
    const clientMessageId = randomUUID();
    const results = await Promise.allSettled(['First', 'Second'].map(body => service.sendMessage('host', threadId, { clientMessageId, body })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(result => result.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.dealMessage.count({ where: { threadId } })).toBe(1);
  });

  it('serializes identical viewing replays without quota or notification amplification', async () => {
    const threadId = await thread('viewing-replay');
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => 1_000, limit: 1 });
    const consume = vi.spyOn(limiter, 'consume');
    const requests = new DealThreadsService(prisma as never, limiter);
    const command = { iso: '2099-02-01T12:00:00.000Z', mode: 'video' as const, participantNames: ['Renter'], timeLabel: 'Feb 1 noon' };
    const results = await Promise.all(Array.from({ length: 8 }, () => requests.createViewingRequest('renter', threadId, command)));
    expect(consume).toHaveBeenCalledTimes(1);
    expect(await prisma.viewingRequest.count({ where: { threadId } })).toBe(1);
    expect(await prisma.dealMessage.count({ where: { threadId } })).toBe(1);
    const request = results[0].viewingRequests[0];
    await requests.confirmViewingRequest('host', threadId, request.id, 1);
    const replay = await requests.createViewingRequest('renter', threadId, command);
    expect(replay.viewingRequests[0]).toMatchObject({ id: request.id, status: 'CONFIRMED', revision: 2 });
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it('bounds database previews while paging all message identities at a tied timestamp', async () => {
    const threadId = await thread('bounded-history');
    const createdAt = new Date('2099-01-01T00:00:00.000Z');
    await prisma.dealMessage.createMany({ data: Array.from({ length: 125 }, (_, index) => ({
      id: `bounded-${String(index).padStart(3, '0')}`, threadId, senderId: 'renter', senderName: 'Renter', body: String(index), createdAt
    })) });
    const preview = (await service.findForUser('host')).find(item => item.id === threadId)!;
    expect(preview.messages).toHaveLength(1);
    const first = await service.listMessages('host', threadId);
    const second = await service.listMessages('host', threadId, { cursor: first.nextCursor });
    const third = await service.listMessages('host', threadId, { cursor: second.nextCursor });
    expect([...third.messages, ...second.messages, ...first.messages].map(item => item.body))
      .toEqual(Array.from({ length: 125 }, (_, index) => String(index)));
    expect(third.nextCursor).toBeNull();
  });

  it('keeps an old active viewing available beyond fifty obsolete history rows', async () => {
    const threadId = await thread('old-active-viewing');
    const data = { threadId, requesterId: 'renter', listingId: 'old-active-viewing', listingTitle: 'Deal fixture', area: 'Westwood',
      timeLabel: 'Feb 1 noon', iso: new Date('2099-02-01T12:00:00.000Z'), mode: 'VIDEO' as const, participantNames: ['Renter'] };
    const active = await prisma.viewingRequest.create({ data: { ...data, status: 'CONFIRMED', createdAt: new Date('2090-01-01'), updatedAt: new Date('2091-01-01') } });
    await prisma.viewingRequest.createMany({ data: Array.from({ length: 60 }, (_, index) => ({ ...data, id: `obsolete-${index}`, status: 'CANCELLED' as const,
      createdAt: new Date(2095, 0, index + 1), updatedAt: new Date(2095, 0, index + 1) })) });
    const preview = (await service.findForUser('host')).find(item => item.id === threadId)!;
    expect(preview.viewingRequests).toHaveLength(50);
    expect(preview.viewingRequests.find((item: { id: string }) => item.id === active.id)).toMatchObject({ status: 'CONFIRMED' });
    const detail = await service.createOrFindThread('renter', { listingId: 'old-active-viewing' });
    expect(detail.viewingRequests.find((item: { id: string }) => item.id === active.id)).toMatchObject({ status: 'CONFIRMED' });
  });

  async function thread(id: string) {
    await prisma.listing.create({ data: { id, ownerId: 'host', title: 'Deal fixture', area: 'Westwood', price: 1800, originalPrice: 1800,
      beds: 1, baths: 1, commute: '', transit: '', trust: '', tags: [], status: 'APPROVED',
      availableFrom: new Date('2099-01-01'), availableTo: new Date('2099-12-31') } });
    return (await service.createOrFindThread('renter', { listingId: id })).id;
  }
});
