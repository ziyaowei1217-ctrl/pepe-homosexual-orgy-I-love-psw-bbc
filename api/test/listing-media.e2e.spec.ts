import "reflect-metadata";

import { INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "../src/auth/auth.guard";
import { AdminGuard } from "../src/auth/admin.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import {
  AdminListingMediaController,
  ListingMediaController,
  PublicListingMediaController
} from "../src/listing-media/listing-media.controller";
import { ListingMediaService } from "../src/listing-media/listing-media.service";

const request = require("supertest") as (server: unknown) => any;

describe("listing media HTTP API", () => {
  let app: INestApplication;
  let service: ReturnType<typeof createService>;

  beforeEach(async () => {
    service = createService();
    const moduleRef = await Test.createTestingModule({
      controllers: [ListingMediaController, PublicListingMediaController, AdminListingMediaController],
      providers: [{ provide: ListingMediaService, useValue: service }]
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
          context.switchToHttp().getRequest().user = {
            id: "owner-1",
            email: "owner-1@example.com",
            role: "USER"
          };
          return true;
        }
      })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("initializes an upload with validated, trimmed metadata", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/listings/listing-1/media/uploads")
      .send(uploadPayload())
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({ uploadUrl: "http://localhost:9000/signed" });
      });

    expect(service.initializeUpload).toHaveBeenCalledWith("owner-1", "listing-1", {
      ...uploadPayload(),
      kind: "卧室"
    });
  });

  it("does not expose private storage keys or legacy media URLs", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/listings/listing-1/media/uploads")
      .send(uploadPayload())
      .expect(201)
      .expect(({ body }: { body: { media: Record<string, unknown> } }) => {
        expect(body.media).not.toHaveProperty("url");
        expect(body.media).not.toHaveProperty("originalKey");
        expect(body.media).not.toHaveProperty("processedKey");
        expect(body.media).not.toHaveProperty("publicMainKey");
        expect(body.media).not.toHaveProperty("publicThumbnailKey");
      });
  });

  it.each([
    [{ ...uploadPayload(), mimeType: "image/gif" }, "unsupported type"],
    [{ ...uploadPayload(), sizeBytes: 10 * 1024 * 1024 + 1 }, "oversize file"],
    [{ ...uploadPayload(), checksumSha256: "unsafe" }, "invalid checksum"],
    [{ ...uploadPayload(), extra: true }, "unknown field"]
  ])("rejects %s", async (payload, _label) => {
    await request(app.getHttpServer())
      .post("/api/v1/listings/listing-1/media/uploads")
      .send(payload)
      .expect(400);
    expect(service.initializeUpload).not.toHaveBeenCalled();
  });

  it("lists, finalizes, retries, reorders, and removes owned media", async () => {
    const http = request(app.getHttpServer());

    await http.get("/api/v1/listings/listing-1/media").expect(200);
    await http.post("/api/v1/listings/listing-1/media/media-1/finalize").expect(201);
    await http.post("/api/v1/listings/listing-1/media/media-1/retry").expect(201);
    await http
      .patch("/api/v1/listings/listing-1/media/order")
      .send({ mediaIds: ["media-2", "media-1"] })
      .expect(200);
    await http.delete("/api/v1/listings/listing-1/media/media-1").expect(200);

    expect(service.findOwned).toHaveBeenCalledWith("owner-1", "listing-1");
    expect(service.finalize).toHaveBeenCalledWith("owner-1", "listing-1", "media-1");
    expect(service.retry).toHaveBeenCalledWith("owner-1", "listing-1", "media-1");
    expect(service.reorder).toHaveBeenCalledWith("owner-1", "listing-1", {
      mediaIds: ["media-2", "media-1"]
    });
    expect(service.remove).toHaveBeenCalledWith("owner-1", "listing-1", "media-1");
  });

  it("rejects duplicate or incomplete reorder input at the HTTP boundary", async () => {
    await request(app.getHttpServer())
      .patch("/api/v1/listings/listing-1/media/order")
      .send({ mediaIds: ["media-1", "media-1"] })
      .expect(400);
    await request(app.getHttpServer())
      .patch("/api/v1/listings/listing-1/media/order")
      .send({ mediaIds: [] })
      .expect(400);
    expect(service.reorder).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access to every owner media route", async () => {
    const guardedService = createService();
    const moduleRef = await Test.createTestingModule({
      controllers: [ListingMediaController],
      providers: [
        AuthGuard,
        { provide: AuthenticatedUserService, useValue: { fromBearerToken: vi.fn() } },
        { provide: ListingMediaService, useValue: guardedService }
      ]
    }).compile();
    const guardedApp = moduleRef.createNestApplication();
    guardedApp.setGlobalPrefix("api/v1");
    await guardedApp.init();

    try {
      const http = request(guardedApp.getHttpServer());
      await http.post("/api/v1/listings/listing-1/media/uploads").send(uploadPayload()).expect(401);
      await http.post("/api/v1/listings/listing-1/media/media-1/finalize").expect(401);
      await http.post("/api/v1/listings/listing-1/media/media-1/retry").expect(401);
      await http.get("/api/v1/listings/listing-1/media").expect(401);
      await http.patch("/api/v1/listings/listing-1/media/order").send({ mediaIds: ["media-1"] }).expect(401);
      await http.delete("/api/v1/listings/listing-1/media/media-1").expect(401);
      expect(guardedService.initializeUpload).not.toHaveBeenCalled();
      expect(guardedService.findOwned).not.toHaveBeenCalled();
      expect(guardedService.finalize).not.toHaveBeenCalled();
      expect(guardedService.retry).not.toHaveBeenCalled();
      expect(guardedService.reorder).not.toHaveBeenCalled();
      expect(guardedService.remove).not.toHaveBeenCalled();
    } finally {
      await guardedApp.close();
    }
  });

  it("delivers published bytes with immutable and nosniff headers", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/listing-media/media-1/content")
      .expect(200)
      .expect("Content-Type", "image/png")
      .expect("Content-Length", "4")
      .expect("Cache-Control", "public, max-age=31536000, immutable")
      .expect("X-Content-Type-Options", "nosniff")
      .expect(({ body }: { body: Buffer }) => {
        expect(body).toEqual(Buffer.from([1, 2, 3, 4]));
      });
  });

  it("delivers ready media through the protected administrator review route", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/admin/listings/listing-1/media/media-1/content")
      .expect(200)
      .expect("Content-Type", "image/png")
      .expect("Cache-Control", "private, no-store")
      .expect("X-Content-Type-Options", "nosniff")
      .expect(({ body }: { body: Buffer }) => {
        expect(body).toEqual(Buffer.from([1, 2, 3, 4]));
      });

    expect(service.readForReview).toHaveBeenCalledWith("listing-1", "media-1");
  });

  it("returns a safe 404 before media is published", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/listing-media/unpublished/content")
      .expect(404)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.code).toBe("LISTING_MEDIA_NOT_AVAILABLE");
      });
  });

  it("retires the legacy URL metadata route", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/listings/listing-1/media")
      .send({ url: "https://example.com/image.jpg", kind: "bedroom" })
      .expect(404);
  });
});

function uploadPayload() {
  return {
    kind: "  卧室  ",
    mimeType: "image/png",
    sizeBytes: 128,
    checksumSha256: "a".repeat(64)
  };
}

function createService() {
  return {
    initializeUpload: vi.fn(async () => ({
      media: mediaResponse("media-1", "PENDING_UPLOAD"),
      uploadUrl: "http://localhost:9000/signed",
      expiresAt: new Date("2026-08-14T05:10:00.000Z")
    })),
    findOwned: vi.fn(async () => [mediaResponse("media-1", "READY"), mediaResponse("media-2", "READY", 1)]),
    finalize: vi.fn(async () => mediaResponse("media-1", "READY")),
    retry: vi.fn(async () => ({
      media: mediaResponse("media-1", "PENDING_UPLOAD"),
      uploadUrl: "http://localhost:9000/signed",
      expiresAt: new Date("2026-08-14T05:10:00.000Z")
    })),
    reorder: vi.fn(async () => [mediaResponse("media-2", "READY"), mediaResponse("media-1", "READY", 1)]),
    remove: vi.fn(async () => ({ removed: true })),
    readPublished: vi.fn(async (mediaId: string) => {
      if (mediaId === "unpublished") {
        throw new NotFoundException({
          code: "LISTING_MEDIA_NOT_AVAILABLE",
          message: "Listing media not available"
        });
      }
      return { bytes: Buffer.from([1, 2, 3, 4]), mimeType: "image/png" };
    }),
    readForReview: vi.fn(async () => ({
      bytes: Buffer.from([1, 2, 3, 4]),
      mimeType: "image/png"
    }))
  };
}

function mediaResponse(id: string, storageStatus: string, sortOrder = 0) {
  return {
    id,
    listingId: "listing-1",
    kind: "卧室",
    sortOrder,
    storageStatus,
    url: "https://storage.example/listing-media/private.jpg",
    originalKey: "listing-media/listing-1/private",
    processedKey: "listing-media/listing-1/processed",
    publicMainKey: "listing-media/listing-1/public-main",
    publicThumbnailKey: "listing-media/listing-1/public-thumbnail"
  };
}
