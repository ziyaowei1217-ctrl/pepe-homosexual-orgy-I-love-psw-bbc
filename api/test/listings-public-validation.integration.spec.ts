import 'reflect-metadata';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createDisposablePostgres } from './support/disposable-postgres';
import { ListingsController } from '../src/listings/listings.controller';
import { AdminListingsController } from '../src/listings/admin-listings.controller';
import { ListingsService } from '../src/listings/listings.service';
import { ListingMediaController, PublicListingMediaController } from '../src/listing-media/listing-media.controller';
import { ListingMediaService } from '../src/listing-media/listing-media.service';
import { S3CompatibleListingMediaStorage } from '../src/listing-media/listing-media-storage';
import { getListingMediaStorageConfig } from '../src/config/env';
import { AuditService } from '../src/audit/audit.service';
import { AuthGuard } from '../src/auth/auth.guard';
import { AdminGuard } from '../src/auth/admin.guard';
import { AdminStepUpGuard } from '../src/auth/admin-step-up.guard';
const reqApi = createRequire(resolve(__dirname, '../package.json'));
const { PrismaClient } = reqApi('@prisma/client');
const { Test } = reqApi('@nestjs/testing');
const { ValidationPipe } = reqApi('@nestjs/common');
const request = reqApi('supertest');
const { S3Client, CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectsCommand } = reqApi('@aws-sdk/client-s3');
describe.skipIf(process.env.RUN_DB_SMOKE !== '1' || process.env.RUN_MEDIA_SMOKE !== '1')('listing PATCH and public media regressions', () => {
  const database = createDisposablePostgres('fix6_listings');
  const bucket = `fix6-listings-${randomUUID()}`;
  const config = getListingMediaStorageConfig({ nodeEnv: 'development', bucket });
  const s3 = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  let prisma: any, app: any, http: any, bucketMade = false;
  beforeAll(async () => {
    database.create(); database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await s3.send(new CreateBucketCommand({ Bucket: bucket })); bucketMade = true;
    await prisma.user.createMany({ data: ['owner', 'admin'].map(id => ({ id, email: `${id}@fix6-listings.test`, role: id === 'admin' ? 'ADMIN' : 'USER' })) });
    await prisma.profile.create({ data: { email: 'owner@fix6-listings.test', displayName: 'Audit owner', school: 'UCLA', city: 'Los Angeles', role: 'lister' } });
    const listings = new ListingsService(prisma, new AuditService());
    const media = new ListingMediaService(prisma, new S3CompatibleListingMediaStorage(config, s3, s3));
    const mod = await Test.createTestingModule({
      controllers: [ListingsController, AdminListingsController, ListingMediaController, PublicListingMediaController],
      providers: [{ provide: ListingsService, useValue: listings }, { provide: ListingMediaService, useValue: media }]
    }).overrideGuard(AuthGuard).useValue({ canActivate(ctx: any) { const r = ctx.switchToHttp().getRequest(); const id = r.headers.authorization === 'Bearer fixture-admin' ? 'admin' : 'owner'; r.user = { id, email: `${id}@fix6-listings.test`, role: id === 'admin' ? 'ADMIN' : 'USER' }; return true; } })
      .overrideGuard(AdminGuard).useValue({ canActivate: () => true }).overrideGuard(AdminStepUpGuard).useValue({ canActivate: () => true }).compile();
    app = mod.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); http = request(app.getHttpServer());
  }, 30_000);
  afterAll(async () => {
    try { await app?.close(); if (bucketMade) { const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket })); if (objects.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.Contents.map((item: { Key: string }) => ({ Key: item.Key })) } })); await s3.send(new DeleteBucketCommand({ Bucket: bucket })); } }
    finally { s3.destroy(); await prisma?.$disconnect(); database.drop(); }
  });
  function payload() { return { title: 'Audit listing', area: 'Westwood', availableFrom: '2099-01-01', availableTo: '2099-12-31', price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: 'Walk', transit: 'Bus', trust: 'Pending review', tags: ['furnished'], score: 4.8 }; }
  async function create() { const response = await http.post('/api/v1/listings').auth('fixture-owner', { type: 'bearer' }).send(payload()).expect(201); return response.body; }
  async function approve(id: string) { const submitted = await http.post(`/api/v1/listings/${id}/submit`).auth('fixture-owner', { type: 'bearer' }).send({}).expect(201); return (await http.post(`/api/v1/admin/listings/${id}/approve`).auth('fixture-admin', { type: 'bearer' }).send({ revision: submitted.body.revision }).expect(201)).body; }
  it('rejects null PATCH fields without changing persisted values or revision', async () => {
    for (const field of ['title', 'area', 'price', 'originalPrice', 'beds', 'baths', 'commute', 'transit', 'trust', 'tags', 'score']) {
      const listing = await create();
      const response = await http.patch(`/api/v1/listings/${listing.id}`).auth('fixture-owner', { type: 'bearer' }).send({ [field]: null });
      const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(response.status).toBe(400);
      expect(after.revision).toBe(listing.revision);
      expect(after[field]).toEqual(listing[field]);
    }
  });
  it('rejects null availability without withdrawing an approved listing', async () => {
    for (const fields of [{ availableFrom: null }, { availableTo: null }, { availableFrom: null, availableTo: null }]) {
      const listing = await create(); const approved = await approve(listing.id);
      await http.get(`/api/v1/listings/${listing.id}`).expect(200);
      const response = await http.patch(`/api/v1/listings/${listing.id}`).auth('fixture-owner', { type: 'bearer' }).send(fields);
      const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      const publicAfter = await http.get(`/api/v1/listings/${listing.id}`);
      expect(response.status).toBe(400); expect(after.status).toBe('APPROVED'); expect(after.revision).toBe(approved.revision); expect(publicAfter.status).toBe(200);
      expect(after.availableFrom.toISOString()).toBe(approved.availableFrom); expect(after.availableTo.toISOString()).toBe(approved.availableTo);
    }
  });
  it('compares public collection and detail for pending and failed media created only through supported owner HTTP routes', async () => {
    const listing = await create(); const uploads = [];
    for (const kind of ['Private unfinished bedroom label', 'Private failed kitchen label']) {
      uploads.push((await http.post(`/api/v1/listings/${listing.id}/media/uploads`).auth('fixture-owner', { type: 'bearer' }).send({ commandId: randomUUID(), kind, mimeType: 'image/png', sizeBytes: 97, checksumSha256: 'a'.repeat(64) }).expect(201)).body);
    }
    const failed = await http.post(`/api/v1/listings/${listing.id}/media/${uploads[1].media.id}/finalize`).auth('fixture-owner', { type: 'bearer' }).send({ uploadAttemptId: uploads[1].uploadAttemptId }).expect(201);
    expect(failed.body.storageStatus).toBe('FAILED');
    const bytes = await reqApi('sharp')({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const readyUpload = (await http.post(`/api/v1/listings/${listing.id}/media/uploads`).auth('fixture-owner', { type: 'bearer' }).send({ commandId: randomUUID(), kind: 'Published photo', mimeType: 'image/png', sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') }).expect(201)).body;
    expect((await fetch(readyUpload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes })).ok).toBe(true);
    await http.post(`/api/v1/listings/${listing.id}/media/${readyUpload.media.id}/finalize`).auth('fixture-owner', { type: 'bearer' }).send({ uploadAttemptId: readyUpload.uploadAttemptId }).expect(201);
    const submitted = await http.post(`/api/v1/listings/${listing.id}/submit`).auth('fixture-owner', { type: 'bearer' }).send({}).expect(201);
    const review = await http.get('/api/v1/admin/listings/review-queue').auth('fixture-admin', { type: 'bearer' }).expect(200);
    expect(review.body.find((item: any) => item.id === listing.id).media).toHaveLength(3);
    await http.post(`/api/v1/admin/listings/${listing.id}/approve`).auth('fixture-admin', { type: 'bearer' }).send({ revision: submitted.body.revision }).expect(201);
    const owned = await http.get(`/api/v1/listings/${listing.id}/media`).auth('fixture-owner', { type: 'bearer' }).expect(200);
    expect(owned.body).toHaveLength(3);
    const detail = await http.get(`/api/v1/listings/${listing.id}`).expect(200);
    const collection = await http.get('/api/v1/listings').expect(200);
    const inCollection = collection.body.find((item: any) => item.id === listing.id);
    const content = await http.get(`/api/v1/listing-media/${uploads[0].media.id}/content`);
    expect(detail.body.media.map((item: any) => item.storageStatus)).toEqual(['PUBLISHED']);
    expect(detail.body.media[0].id).toBe(readyUpload.media.id);
    expect(inCollection.media).toEqual(detail.body.media); expect(content.status).toBe(404);
  });

  it('preserves omitted fields on valid partial updates', async () => { const listing = await create(); const response = await http.patch(`/api/v1/listings/${listing.id}`).auth('fixture-owner', { type: 'bearer' }).send({ title: 'Updated title' }).expect(200); expect(response.body).toMatchObject({ title: 'Updated title', price: listing.price, availableFrom: listing.availableFrom, status: 'DRAFT', revision: listing.revision + 1 }); });
});
