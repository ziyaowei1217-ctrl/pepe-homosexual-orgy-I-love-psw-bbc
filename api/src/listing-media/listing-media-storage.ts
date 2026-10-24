import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type DeleteObjectCommandOutput,
  type GetObjectCommandOutput
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ListingMediaStorageConfig } from "../config/env";
import {
  MAX_LISTING_MEDIA_BYTES,
  type ListingMediaSecurityCode,
  type SupportedListingMediaMimeType
} from "./listing-media.constants";

export const LISTING_MEDIA_STORAGE = Symbol("LISTING_MEDIA_STORAGE");

export type ListingMediaUploadTarget = {
  uploadUrl: string;
  expiresAt: Date;
};

export interface ListingMediaStorage {
  createUploadUrl(
    key: string,
    mimeType: SupportedListingMediaMimeType,
    sizeBytes: number
  ): Promise<ListingMediaUploadTarget>;
  write(key: string, bytes: Buffer, mimeType: SupportedListingMediaMimeType): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

type StorageSecurityCode = Extract<
  ListingMediaSecurityCode,
  "IMAGE_OBJECT_MISSING" | "IMAGE_STORAGE_UNAVAILABLE" | "IMAGE_TOO_LARGE"
>;

export class ListingMediaStorageError extends Error {
  constructor(readonly code: StorageSecurityCode) {
    super(code);
    this.name = "ListingMediaStorageError";
  }
}

type StorageCommand = GetObjectCommand | DeleteObjectCommand | PutObjectCommand;
type StorageResponse = GetObjectCommandOutput | DeleteObjectCommandOutput;
type StorageClient = {
  send(command: StorageCommand, options?: { abortSignal?: AbortSignal }): Promise<StorageResponse>;
};
type UploadSigner = (
  client: S3Client,
  command: PutObjectCommand,
  options: { expiresIn: number }
) => Promise<string>;

export class S3CompatibleListingMediaStorage implements ListingMediaStorage {
  private readonly client: StorageClient;
  private readonly uploadClient: S3Client;

  constructor(
    private readonly config: ListingMediaStorageConfig,
    client?: StorageClient,
    uploadClient?: S3Client,
    private readonly signUpload: UploadSigner = getSignedUrl,
    private readonly now: () => Date = () => new Date()
  ) {
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        }
      });
    this.uploadClient =
      uploadClient ??
      new S3Client({
        endpoint: config.uploadEndpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        }
      });
  }

  async createUploadUrl(
    key: string,
    mimeType: SupportedListingMediaMimeType,
    sizeBytes: number
  ): Promise<ListingMediaUploadTarget> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes
    });

    try {
      const uploadUrl = await this.signUpload(
        this.uploadClient,
        command,
        { expiresIn: this.config.uploadTtlSeconds }
      );
      return {
        uploadUrl,
        expiresAt: new Date(this.now().getTime() + this.config.uploadTtlSeconds * 1000)
      };
    } catch {
      throw new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE");
    }
  }

  async write(key: string, bytes: Buffer, mimeType: SupportedListingMediaMimeType): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        ContentLength: bytes.length,
        IfNoneMatch: "*"
      }), { abortSignal: AbortSignal.timeout(15_000) });
    } catch {
      throw new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE");
    }
  }

  async read(key: string): Promise<Buffer> {
    const controller = new AbortController();
    let body: (AsyncIterable<Uint8Array> & { destroy?: () => void }) | undefined;
    const timeout = setTimeout(() => {
      controller.abort();
      body?.destroy?.();
    }, 15_000);
    timeout.unref();
    try {
      const response = (await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: controller.signal }
      )) as GetObjectCommandOutput;
      if (!response.Body) throw new ListingMediaStorageError("IMAGE_OBJECT_MISSING");
      body = response.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
      if (controller.signal.aborted) throw new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE");
      if (response.ContentLength !== undefined && response.ContentLength > MAX_LISTING_MEDIA_BYTES) {
        body.destroy?.();
        throw new ListingMediaStorageError("IMAGE_TOO_LARGE");
      }
      // Stream with a hard ceiling: checking only after buffering trusts an upload's length header.
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      try {
        for await (const chunk of body) {
          totalBytes += chunk.byteLength;
          if (totalBytes > MAX_LISTING_MEDIA_BYTES) throw new ListingMediaStorageError("IMAGE_TOO_LARGE");
          chunks.push(Buffer.from(chunk));
        }
        if (controller.signal.aborted) throw new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE");
        return Buffer.concat(chunks, totalBytes);
      } catch (error) {
        body.destroy?.();
        throw error;
      }
    } catch (error) {
      if (error instanceof ListingMediaStorageError) throw error;
      if (isMissingObject(error)) {
        throw new ListingMediaStorageError("IMAGE_OBJECT_MISSING");
      }
      throw new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE");
    } finally {
      if (controller.signal.aborted) body?.destroy?.();
      clearTimeout(timeout);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(15_000) }
      );
    } catch (error) {
      if (isMissingObject(error)) return;
      throw new ListingMediaStorageError("IMAGE_STORAGE_UNAVAILABLE");
    }
  }
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404;
}
