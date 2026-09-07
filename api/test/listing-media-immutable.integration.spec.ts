import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDisposablePostgres } from './support/disposable-postgres';
import { getListingMediaStorageConfig } from '../src/config/env';
import { S3CompatibleListingMediaStorage } from '../src/listing-media/listing-media-storage';
import { ListingMediaService } from '../src/listing-media/listing-media.service';
import { ListingsService } from '../src/listings/listings.service';
import { AuditService } from '../src/audit/audit.service';
import { PrismaClient } from '@prisma/client';
import { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import sharp from 'sharp';
const database = createDisposablePostgres('media_immutable');
const bucket = `audit3-media-${randomUUID()}`;
const config = getListingMediaStorageConfig({ nodeEnv: 'development', bucket });
const s3 = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
let prisma: PrismaClient;
let madeBucket = false;
const enabled = process.env.RUN_DB_SMOKE === '1' && process.env.RUN_MEDIA_SMOKE === '1';
beforeAll(async () => {
  if (!enabled) return;
  database.create(); database.migrateDeploy();
  prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
  await s3.send(new CreateBucketCommand({ Bucket: bucket })); madeBucket = true;
  await prisma.user.createMany({ data: [{ id: 'owner', email: 'owner@audit3.test' }, { id: 'admin', email: 'admin@audit3.test', role: 'ADMIN' }] });
  await prisma.profile.create({ data: { email: 'owner@audit3.test', displayName: 'Owner', school: 'UCLA', city: 'Los Angeles', role: 'lister' } });
}, 30_000);
afterAll(async () => {
  if (!enabled) return;
  try {
    if (madeBucket) {
      const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
      if (objects.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.Contents.map((item) => ({ Key: item.Key })) } }));
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    }
  } finally { s3.destroy(); await prisma?.$disconnect(); database.drop(); }
});
it.skipIf(!enabled)('keeps reviewed bytes after replaying the original signed upload URL', async () => {
  const storage = new S3CompatibleListingMediaStorage(config, s3, s3);
  const media = new ListingMediaService(prisma as never, storage);
  const listings = new ListingsService(prisma as never, new AuditService());
  const red = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const blue = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
  const byteLength = Math.max(red.length, blue.length);
  const pad = (input: Buffer) => Buffer.concat([input, Buffer.alloc(byteLength - input.length)]);
  const original = pad(red), replacement = pad(blue);
  const sha = (input: Buffer) => createHash('sha256').update(input).digest('hex');
  expect(sha(original)).not.toBe(sha(replacement));
  const listing = await listings.create('owner', { title: 'Reviewed room', area: 'Westwood', availableFrom: '2099-01-01', availableTo: '2099-12-31', price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: 'Walk', transit: 'Bus', trust: 'Pending', tags: [] });
  const upload = await media.initializeUpload('owner', listing.id, { commandId: randomUUID(), kind: 'bedroom', mimeType: 'image/png', sizeBytes: byteLength, checksumSha256: sha(original) });
  const put1 = await fetch(upload.uploadUrl!, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(original) });
  expect(put1.status, await put1.text()).toBe(200);
  expect((await media.finalize('owner', listing.id, upload.media.id, upload.uploadAttemptId)).storageStatus).toBe('READY');
  const submitted = await listings.submit('owner', listing.id);
  const reviewed = await media.readForReview(listing.id, upload.media.id);
  expect(sha(reviewed.bytes)).toBe(sha(original));
  const approved = await listings.approve(listing.id, { actorUserId: 'admin', actorEmail: 'admin@audit3.test', actorType: 'USER' }, submitted.revision);
  const put2 = await fetch(upload.uploadUrl!, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(replacement) });
  expect(put2.status, await put2.text()).toBe(200);
  const published = await media.readPublished(upload.media.id);
  const afterListing = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
  const afterMedia = await prisma.listingMedia.findUniqueOrThrow({ where: { id: upload.media.id } });
  expect(sha(published.bytes)).toBe(sha(reviewed.bytes));
  expect(afterMedia.checksum).toBe(sha(original));
  expect(afterListing.revision).toBe(approved.revision);
  expect(afterListing.status).toBe('APPROVED');
});
it.skipIf(!enabled)('recovers an interrupted PUT with a new usable target on the same pending media row', async () => {
  const storage = new S3CompatibleListingMediaStorage(config, s3, s3);
  const media = new ListingMediaService(prisma as never, storage);
  const listings = new ListingsService(prisma as never, new AuditService());
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const listing = await listings.create('owner', { title: 'Retry room', area: 'Westwood', availableFrom: '2099-01-01', availableTo: '2099-12-31', price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: 'Walk', transit: 'Bus', trust: 'Pending', tags: [] });
  const first = await media.initializeUpload('owner', listing.id, { commandId: randomUUID(), kind: 'bedroom', mimeType: 'image/png', sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') });
  // No object was uploaded: the browser's PUT was interrupted.
  const retry = await media.retry('owner', listing.id, first.media.id, first.uploadAttemptId);
  expect(retry.media.id).toBe(first.media.id);
  expect(retry.media.originalKey).not.toBe(first.media.originalKey);
  const put = await fetch(retry.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(bytes) });
  expect(put.status, await put.text()).toBe(200);
  const ready = await media.finalize('owner', listing.id, first.media.id, retry.uploadAttemptId);
  expect(ready.storageStatus).toBe('READY');
  expect(await storage.read(ready.processedKey!)).toEqual(bytes);
  expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(1);
});
it.skipIf(!enabled)('rejects commands bound to the old upload after retry rotates the current attempt', async () => {
  const storage = new S3CompatibleListingMediaStorage(config, s3, s3);
  const media = new ListingMediaService(prisma as never, storage);
  const listings = new ListingsService(prisma as never, new AuditService());
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const listing = await listings.create('owner', { title: 'Attempt identity room', area: 'Westwood', availableFrom: '2099-01-01', availableTo: '2099-12-31', price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: 'Walk', transit: 'Bus', trust: 'Pending', tags: [] });
  const first = await media.initializeUpload('owner', listing.id, { commandId: randomUUID(), kind: 'bedroom', mimeType: 'image/png', sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') });
  const oldAttempt = createHash('sha256').update(`listing-media-attempt:${first.media.originalKey}`).digest('hex');
  const second = await media.retry('owner', listing.id, first.media.id, oldAttempt);
  await expect(media.finalize('owner', listing.id, first.media.id, oldAttempt)).rejects.toMatchObject({ status: 409 });
  await expect(media.retry('owner', listing.id, first.media.id, oldAttempt)).rejects.toMatchObject({ status: 409 });
  expect(await prisma.listingMedia.findUnique({ where: { id: first.media.id } })).toMatchObject({ storageStatus: 'PENDING_UPLOAD', originalKey: second.media.originalKey });
  const put = await fetch(second.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(bytes) });
  expect(put.status, await put.text()).toBe(200);
  const currentAttempt = createHash('sha256').update(`listing-media-attempt:${second.media.originalKey}`).digest('hex');
  expect((await media.finalize('owner', listing.id, first.media.id, currentAttempt)).storageStatus).toBe('READY');
});
it.skipIf(!enabled)('returns its committed media and attempt even if another retry rotates during cleanup', async () => {
  const storage = new S3CompatibleListingMediaStorage(config, s3, s3);
  const media = new ListingMediaService(prisma as never, storage);
  const listings = new ListingsService(prisma as never, new AuditService());
  const listing = await listings.create('owner', { title: 'Cleanup race room', area: 'Westwood', availableFrom: '2099-01-01', availableTo: '2099-12-31', price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: 'Walk', transit: 'Bus', trust: 'Pending', tags: [] });
  const first = await media.initializeUpload('owner', listing.id, { commandId: randomUUID(), kind: 'bedroom', mimeType: 'image/png', sizeBytes: 3, checksumSha256: 'a'.repeat(64) });
  let cleanupStarted!: () => void;
  let resume!: () => void;
  const started = new Promise<void>(resolve => { cleanupStarted = resolve; });
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const slow = new ListingMediaService(prisma as never, {
    createUploadUrl: storage.createUploadUrl.bind(storage), read: storage.read.bind(storage), write: storage.write.bind(storage),
    delete: async (key) => { cleanupStarted(); await gate; await storage.delete(key); }
  });
  const pending = slow.retry('owner', listing.id, first.media.id, first.uploadAttemptId);
  await started;
  let committed: Awaited<ReturnType<typeof prisma.listingMedia.findUniqueOrThrow>>;
  try {
    committed = await prisma.listingMedia.findUniqueOrThrow({ where: { id: first.media.id } });
    const attempt = createHash('sha256').update(`listing-media-attempt:${committed.originalKey}`).digest('hex');
    await media.retry('owner', listing.id, first.media.id, attempt);
  } finally { resume(); }
  const response = await pending;
  expect(response.media.originalKey).toBe(committed.originalKey);
  expect(response.uploadAttemptId).toBe(createHash('sha256').update(`listing-media-attempt:${response.media.originalKey}`).digest('hex'));
});
it.skipIf(!enabled)('replays a lost initialization response on the same row and permits its signed PUT', async () => {
  const { service, listing, input, bytes } = await initializationFixture();
  const first = await service.initializeUpload('owner', listing.id, input);
  const recovered = await service.initializeUpload('owner', listing.id, input);
  expect(recovered.media.id).toBe(first.media.id);
  expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(1);
  const put = await fetch(recovered.uploadUrl!, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(bytes) });
  expect(put.status, await put.text()).toBe(200);
  expect((await service.finalize('owner', listing.id, recovered.media.id, recovered.uploadAttemptId)).storageStatus).toBe('READY');
});
it.skipIf(!enabled)('rejects reused initialization identity with different payload or listing and preserves owner checks', async () => {
  const { service, listing, input } = await initializationFixture();
  await service.initializeUpload('owner', listing.id, input);
  await expect(service.initializeUpload('owner', listing.id, { ...input, kind: 'changed' })).rejects.toMatchObject({ status: 409 });
  const other = await initializationFixture();
  await expect(service.initializeUpload('owner', other.listing.id, input)).rejects.toMatchObject({ status: 409 });
  await expect(service.initializeUpload('admin', listing.id, input)).rejects.toMatchObject({ status: 404 });
});
it.skipIf(!enabled)('recovers committed initialization after submission without returning a new upload capability', async () => {
  const { service, listing, input } = await initializationFixture();
  const first = await service.initializeUpload('owner', listing.id, input);
  await new ListingsService(prisma as never, new AuditService()).submit('owner', listing.id);
  const recovered = await service.initializeUpload('owner', listing.id, input);
  expect(recovered.media.id).toBe(first.media.id);
  expect(recovered.uploadUrl).toBeNull();
  await expect(service.initializeUpload('owner', listing.id, { ...input, commandId: randomUUID() })).rejects.toMatchObject({ status: 409 });
});
it.skipIf(!enabled)('deduplicates concurrent initialization commands and replays at the image limit', async () => {
  const { service, listing, input } = await initializationFixture();
  const [first, second] = await Promise.all([service.initializeUpload('owner', listing.id, input), service.initializeUpload('owner', listing.id, input)]);
  expect(first.media.id).toBe(second.media.id);
  for (let i = 1; i < 12; i++) await service.initializeUpload('owner', listing.id, { ...input, commandId: randomUUID() });
  expect((await service.initializeUpload('owner', listing.id, input)).media.id).toBe(first.media.id);
  await expect(service.initializeUpload('owner', listing.id, { ...input, commandId: randomUUID() })).rejects.toMatchObject({ status: 400 });
  expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(12);
});
async function initializationFixture() {
  const service = new ListingMediaService(prisma as never, new S3CompatibleListingMediaStorage(config, s3, s3));
  const listing = await new ListingsService(prisma as never, new AuditService()).create('owner', { title: 'Initialization recovery', area: 'Westwood', availableFrom: '2099-01-01', availableTo: '2099-12-31', price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: 'Walk', transit: 'Bus', trust: 'Pending', tags: [] });
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const input = { commandId: randomUUID(), kind: 'bedroom', mimeType: 'image/png' as const, sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') };
  return { service, listing, input, bytes };
}
it.skipIf(!enabled)('retains a deletion tombstone and cascades the receipt with its listing', async () => {
  const { service, listing, input } = await initializationFixture();
  const first = await service.initializeUpload('owner', listing.id, input);
  await service.remove('owner', listing.id, first.media.id);
  await expect(service.initializeUpload('owner', listing.id, input)).rejects.toMatchObject({ status: 409 });
  expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(0);
  expect(await prisma.listingMediaInitialization.findUnique({ where: { ownerId_commandId: { ownerId: 'owner', commandId: input.commandId } } })).toMatchObject({ mediaId: null });
  await prisma.listing.delete({ where: { id: listing.id } });
  expect(await prisma.listingMediaInitialization.count({ where: { listingId: listing.id } })).toBe(0);
  await expect(service.initializeUpload('owner', listing.id, input)).rejects.toMatchObject({ status: 404 });
});
it.skipIf(!enabled)('rolls back both media and receipt when initialization cannot commit', async () => {
  const { service, listing, input } = await initializationFixture();
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_media_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt unavailable'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_media_receipt BEFORE INSERT ON "ListingMediaInitialization" FOR EACH ROW EXECUTE FUNCTION fail_media_receipt()`);
  try {
    await expect(service.initializeUpload('owner', listing.id, input)).rejects.toThrow();
    expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(0);
    expect(await prisma.listingMediaInitialization.count({ where: { listingId: listing.id } })).toBe(0);
  } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER fail_media_receipt ON "ListingMediaInitialization"`); }
  expect((await service.initializeUpload('owner', listing.id, input)).media.storageStatus).toBe('PENDING_UPLOAD');
});
