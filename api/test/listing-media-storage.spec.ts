import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { getListingMediaStorageConfig } from "../src/config/env";
import {
  ListingMediaStorageError,
  S3CompatibleListingMediaStorage
} from "../src/listing-media/listing-media-storage";

describe("listing media storage config", () => {
  it("uses bounded local MinIO defaults outside production", () => {
    expect(getListingMediaStorageConfig({ nodeEnv: "development" })).toEqual({
      endpoint: "http://localhost:9000",
      uploadEndpoint: "http://localhost:9000",
      region: "us-east-1",
      bucket: "listing-media",
      accessKeyId: "minio",
      secretAccessKey: "minio-development",
      uploadTtlSeconds: 600,
      forcePathStyle: true
    });
  });

  it("requires every private object-storage setting in production", () => {
    expect(() => getListingMediaStorageConfig({ nodeEnv: "production" })).toThrow(
      "LISTING_MEDIA_STORAGE_ENDPOINT is required in production"
    );
    expect(() =>
      getListingMediaStorageConfig({
        nodeEnv: "production",
        endpoint: "https://objects.internal.example.com",
        region: "us-east-1",
        bucket: "private-listing-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key"
      })
    ).toThrow("LISTING_MEDIA_UPLOAD_ENDPOINT is required in production");

    expect(() =>
      getListingMediaStorageConfig({
        nodeEnv: "production",
        endpoint: "https://objects.example.com",
        uploadEndpoint: "https://uploads.example.com",
        region: "us-east-1",
        bucket: "private-listing-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key"
      })
    ).not.toThrow();
  });

  it("keeps the upload URL lifetime fixed at ten minutes", () => {
    expect(() =>
      getListingMediaStorageConfig({ nodeEnv: "development", uploadTtlSeconds: "601" })
    ).toThrow("LISTING_MEDIA_UPLOAD_TTL_SECONDS must be 600");
  });
});

describe("S3-compatible listing media storage", () => {
  it("presigns a length- and content-type-bound private PUT for ten minutes", async () => {
    const send = vi.fn();
    const sign = vi.fn(async (_client: unknown, _command: unknown, _options: unknown) =>
      "http://localhost:9000/signed-upload"
    );
    const uploadClient = { send: vi.fn() };
    const storage = createStorage(send, sign, uploadClient);

    await expect(storage.createUploadUrl("listing-media/listing-1/object-1", "image/png", 2048)).resolves.toEqual({
      uploadUrl: "http://localhost:9000/signed-upload",
      expiresAt: new Date("2026-08-14T05:10:00.000Z")
    });

    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0]?.[0]).toBe(uploadClient);
    const command = sign.mock.calls[0]?.[1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: "listing-media",
      Key: "listing-media/listing-1/object-1",
      ContentType: "image/png",
      ContentLength: 2048
    });
    expect(sign.mock.calls[0]?.[2]).toEqual({ expiresIn: 600 });
  });

  it("writes the exact buffer with conditional creation on the server client", async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const bytes = Buffer.from("validated");
    const storage = createStorage(send);
    await storage.write("frozen/key", bytes, "image/png");
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect((send.mock.calls[0]?.[0] as PutObjectCommand).input).toEqual({
      Bucket: "listing-media", Key: "frozen/key", Body: bytes,
      ContentType: "image/png", ContentLength: bytes.length, IfNoneMatch: "*"
    });
    expect((send.mock.calls[0]?.[0] as PutObjectCommand).input.Body).toBe(bytes);
  });

  it("returns the complete stored body as a Buffer", async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const send = vi.fn(async (command: unknown) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      return { Body: { transformToByteArray: async () => bytes } };
    });
    const storage = createStorage(send);

    await expect(storage.read("listing-media/listing-1/object-1")).resolves.toEqual(Buffer.from(bytes));
  });

  it("normalizes missing objects and storage failures without leaking provider messages", async () => {
    const missing = Object.assign(new Error("provider missing detail"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 }
    });
    const missingStorage = createStorage(vi.fn(async () => Promise.reject(missing)));

    await expect(missingStorage.read("missing")).rejects.toEqual(
      new ListingMediaStorageError("IMAGE_OBJECT_MISSING")
    );

    const unavailableStorage = createStorage(
      vi.fn(async () => Promise.reject(new Error("private network address leaked")))
    );
    await expect(unavailableStorage.read("private")).rejects.toEqual(
      new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE")
    );
  });

  it("deletes only the requested private object key", async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const storage = createStorage(send);

    await storage.delete("listing-media/listing-1/object-1");

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({
      Bucket: "listing-media",
      Key: "listing-media/listing-1/object-1"
    });
  });
});

function createStorage(
  send: ReturnType<typeof vi.fn>,
  sign = vi.fn(async (_client: unknown, _command: unknown, _options: unknown) => "signed"),
  uploadClient = { send: vi.fn() }
) {
  return new S3CompatibleListingMediaStorage(
    {
      endpoint: "http://localhost:9000",
      uploadEndpoint: "http://localhost:9000",
      region: "us-east-1",
      bucket: "listing-media",
      accessKeyId: "minio",
      secretAccessKey: "minio-development",
      uploadTtlSeconds: 600,
      forcePathStyle: true
    },
    { send } as never,
    uploadClient as never,
    sign as never,
    () => new Date("2026-08-14T05:00:00.000Z")
  );
}
