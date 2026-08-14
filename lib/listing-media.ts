import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { toProductApiError } from "./product-errors";

export const MAX_LISTING_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_LISTING_MEDIA_COUNT = 12;
export const LISTING_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ListingMediaMimeType = (typeof LISTING_MEDIA_MIME_TYPES)[number];
export type ListingMediaStorageStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED_PENDING_VALIDATION"
  | "READY"
  | "PUBLISHED"
  | "FAILED";

export type ApiListingMedia = {
  id: string;
  listingId?: string;
  kind: string;
  sortOrder: number;
  mimeType: ListingMediaMimeType | null;
  sizeBytes: number | null;
  checksum: string | null;
  width?: number | null;
  height?: number | null;
  storageStatus: ListingMediaStorageStatus;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  securityErrorCode?: string | null;
  uploadExpiresAt: string | null;
  finalizedAt: string | null;
  publishedAt: string | null;
  contentUrl?: string;
};

export type InitializedListingMediaUpload = {
  media: ApiListingMedia;
  uploadUrl: string;
  expiresAt: string;
};

export type ListingMediaSummary = {
  totalCount: number;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  mutationPending: boolean;
};

type FileDescriptor = Pick<File, "type" | "size"> | { type: string; size: number };

export function listingFileError(file: FileDescriptor, currentCount: number): string | null {
  if (currentCount >= MAX_LISTING_MEDIA_COUNT) return "每套房源最多上传 12 张图片。";
  if (!(LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "仅支持 JPEG、PNG 或 WebP 图片。";
  }
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > MAX_LISTING_MEDIA_BYTES) {
    return "单张图片不能超过 10 MB。";
  }
  return null;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function buildListingMediaSummary(
  media: Array<Pick<ApiListingMedia, "storageStatus">>,
  mutationPending = false
): ListingMediaSummary {
  return {
    totalCount: media.length,
    readyCount: media.filter((item) => item.storageStatus === "READY" || item.storageStatus === "PUBLISHED").length,
    pendingCount: media.filter(
      (item) => item.storageStatus === "PENDING_UPLOAD" || item.storageStatus === "UPLOADED_PENDING_VALIDATION"
    ).length,
    failedCount: media.filter((item) => item.storageStatus === "FAILED").length,
    mutationPending
  };
}

export async function runMediaUploadQueue<Input, Output>(
  inputs: readonly Input[],
  worker: (input: Input, index: number) => Promise<Output>,
  concurrency = 3
): Promise<Array<PromiseSettledResult<Output>>> {
  const results = new Array<PromiseSettledResult<Output>>(inputs.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, inputs.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < inputs.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = { status: "fulfilled", value: await worker(inputs[index]!, index) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    })
  );

  return results;
}

export function getOwnedListingMedia(token: string, listingId: string) {
  return apiGet<ApiListingMedia[]>(`/listings/${encodeURIComponent(listingId)}/media`, token);
}

export async function initializeListingMedia(token: string, listingId: string, file: File, kind: string) {
  const checksumSha256 = await sha256Hex(await file.arrayBuffer());
  return apiPost<InitializedListingMediaUpload>(
    `/listings/${encodeURIComponent(listingId)}/media/uploads`,
    { kind, mimeType: file.type, sizeBytes: file.size, checksumSha256 },
    token
  );
}

export function finalizeListingMedia(token: string, listingId: string, mediaId: string) {
  return apiPost<ApiListingMedia>(
    `/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}/finalize`,
    {},
    token
  );
}

export function retryListingMedia(token: string, listingId: string, mediaId: string) {
  return apiPost<InitializedListingMediaUpload>(
    `/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}/retry`,
    {},
    token
  );
}

export function reorderListingMedia(token: string, listingId: string, mediaIds: string[]) {
  return apiPatch<ApiListingMedia[]>(
    `/listings/${encodeURIComponent(listingId)}/media/order`,
    { mediaIds },
    token
  );
}

export function removeListingMedia(token: string, listingId: string, mediaId: string) {
  return apiDelete<{ removed: true }>(
    `/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}`,
    token
  );
}

export function putPresignedFile(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(toProductApiError({ status: 503 }));
      }
    };
    request.onerror = () => reject(toProductApiError(new TypeError("Failed to fetch")));
    request.onabort = () => reject(toProductApiError({ status: 408 }));
    request.send(file);
  });
}
