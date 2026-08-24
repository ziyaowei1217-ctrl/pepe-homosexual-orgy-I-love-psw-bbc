"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  type ApiListingMedia,
  type ListingMediaSummary,
  buildListingMediaSummary,
  finalizeListingMedia,
  getOwnedListingMedia,
  initializeListingMedia,
  listingFileError,
  putPresignedFile,
  removeListingMedia,
  reorderListingMedia,
  retryListingMedia,
  runMediaUploadQueue
} from "@/lib/listing-media";
import { toProductApiError } from "@/lib/product-errors";

type MediaRow = {
  key: string;
  media: ApiListingMedia;
  file?: File;
  previewUrl?: string;
  progress: number;
  localError?: string;
};

export function ListingMediaUploader({
  listingId,
  token,
  disabled,
  onSummaryChange
}: {
  listingId: string;
  token: string;
  disabled: boolean;
  onSummaryChange(summary: ListingMediaSummary): void;
}) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [mutationPending, setMutationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    setError(null);
    void getOwnedListingMedia(token, listingId)
      .then((media) => {
        if (!active) return;
        setRows(media.map((item) => ({ key: item.id, media: item, progress: readyProgress(item) })));
      })
      .catch((caught) => {
        if (active) setError(toProductApiError(caught).message);
      });
    return () => {
      active = false;
    };
  }, [listingId, token]);

  useEffect(() => {
    onSummaryChange(buildListingMediaSummary(rows.map((row) => row.media), mutationPending));
  }, [mutationPending, onSummaryChange, rows]);

  useEffect(() => () => {
    for (const url of previews.current) URL.revokeObjectURL?.(url);
    previews.current.clear();
  }, []);

  async function selectFiles(filesLike: FileList | ArrayLike<File> | null) {
    const files = Array.from(filesLike ?? []);
    if (files.length === 0 || disabled) return;
    setError(null);

    for (const [index, file] of files.entries()) {
      const validationError = listingFileError(file, rows.length + index);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    const additions = files.map((file, index): MediaRow => {
      const key = `local-${Date.now()}-${index}`;
      const previewUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previews.current.add(previewUrl);
      return {
        key,
        file,
        previewUrl,
        progress: 0,
        media: pendingMedia(key, rows.length + index)
      };
    });
    setRows((current) => [...current, ...additions]);
    setMutationPending(true);

    await runMediaUploadQueue(additions, async (row) => uploadRow(row));
    setMutationPending(false);
  }

  async function uploadRow(row: MediaRow) {
    if (!row.file) return;
    let remoteMedia = row.media;
    try {
      updateRow(row.key, { progress: 0, localError: undefined });
      const initialized = await initializeListingMedia(token, listingId, row.file, row.media.kind);
      remoteMedia = initialized.media;
      updateRow(row.key, { media: remoteMedia, progress: 1 });
      await putPresignedFile(initialized.uploadUrl, row.file, (progress) => updateRow(row.key, { progress }));
      updateRow(row.key, {
        media: { ...remoteMedia, storageStatus: "UPLOADED_PENDING_VALIDATION" },
        progress: 100
      });
      const finalized = await finalizeListingMedia(token, listingId, remoteMedia.id);
      updateRow(row.key, { media: finalized, progress: 100, localError: undefined });
    } catch (caught) {
      updateRow(row.key, {
        media: { ...remoteMedia, storageStatus: "FAILED" },
        localError: toProductApiError(caught).message
      });
    }
  }

  async function retry(row: MediaRow) {
    if (!row.file || disabled) return;
    setMutationPending(true);
    setError(null);
    try {
      const initialized = await retryListingMedia(token, listingId, row.media.id);
      updateRow(row.key, { media: initialized.media, progress: 0, localError: undefined });
      await putPresignedFile(initialized.uploadUrl, row.file, (progress) => updateRow(row.key, { progress }));
      const finalized = await finalizeListingMedia(token, listingId, row.media.id);
      updateRow(row.key, { media: finalized, progress: 100, localError: undefined });
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setMutationPending(false);
    }
  }

  async function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= rows.length || disabled || mutationPending) return;
    const previous = rows;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
    setMutationPending(true);
    try {
      const ordered = await reorderListingMedia(token, listingId, next.map((row) => row.media.id));
      const byId = new Map(next.map((row) => [row.media.id, row]));
      setRows(ordered.map((media) => ({ ...byId.get(media.id)!, media })));
    } catch (caught) {
      setRows(previous);
      setError(toProductApiError(caught).message);
    } finally {
      setMutationPending(false);
    }
  }

  async function remove(row: MediaRow) {
    if (disabled || mutationPending) return;
    if (typeof window !== "undefined" && !window.confirm("删除这张图片？")) return;
    setMutationPending(true);
    try {
      await removeListingMedia(token, listingId, row.media.id);
      if (row.previewUrl) {
        URL.revokeObjectURL?.(row.previewUrl);
        previews.current.delete(row.previewUrl);
      }
      setRows((current) => current.filter((item) => item.key !== row.key));
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setMutationPending(false);
    }
  }

  function updateRow(key: string, patch: Partial<MediaRow>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  return (
    <section className="space-y-4" aria-label="房源图片上传">
      <label
        className="grid min-h-28 cursor-pointer place-items-center rounded-md border border-dashed bg-secondary/40 p-5 text-center text-sm font-semibold text-muted-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void selectFiles(event.dataTransfer.files);
        }}
      >
        <span>拖放图片到这里，或点击选择文件</span>
        <span className="text-xs">JPEG、PNG、WebP · 单张不超过 10 MB · 最多 12 张</span>
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || mutationPending}
          onChange={(event) => {
            void selectFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {rows.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((row, index) => (
            <li key={row.key} className="grid gap-3 rounded-md border bg-white p-3">
              {row.previewUrl ? (
                <Image
                  unoptimized
                  width={720}
                  height={288}
                  className="h-36 w-full rounded-md object-cover"
                  src={row.previewUrl}
                  alt={`${row.media.kind}预览`}
                />
              ) : (
                <div className="grid h-24 place-items-center rounded-md bg-secondary text-xs text-muted-foreground">已保存图片</div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-primary">{row.media.kind} {index === 0 ? "· 封面" : ""}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{mediaStatusLabel(row)}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={disabled || mutationPending || index === 0} onClick={() => void move(index, -1)}>前移</Button>
                  <Button size="sm" variant="ghost" disabled={disabled || mutationPending || index === rows.length - 1} onClick={() => void move(index, 1)}>后移</Button>
                </div>
              </div>
              {row.media.storageStatus === "FAILED" && row.file ? (
                <Button size="sm" variant="outline" disabled={disabled || mutationPending} onClick={() => void retry(row)}>重试</Button>
              ) : null}
              {row.media.storageStatus === "FAILED" && !row.file ? (
                <p className="text-xs font-semibold text-muted-foreground">请删除后重新选择文件</p>
              ) : null}
              <Button size="sm" variant="ghost" disabled={disabled || mutationPending} onClick={() => void remove(row)}>删除</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">尚未添加图片。</p>
      )}

      {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
    </section>
  );
}

function pendingMedia(id: string, sortOrder: number): ApiListingMedia {
  return {
    id,
    kind: "卧室",
    sortOrder,
    mimeType: null,
    sizeBytes: null,
    checksum: null,
    storageStatus: "PENDING_UPLOAD",
    reviewStatus: "PENDING",
    uploadExpiresAt: null,
    finalizedAt: null,
    publishedAt: null
  };
}

function readyProgress(media: ApiListingMedia) {
  return media.storageStatus === "READY" || media.storageStatus === "PUBLISHED" ? 100 : 0;
}

function mediaStatusLabel(row: MediaRow) {
  if (row.localError) return `上传失败：${row.localError}`;
  if (row.media.storageStatus === "FAILED") return `上传失败${row.media.securityErrorCode ? ` · ${row.media.securityErrorCode}` : ""}`;
  if (row.media.storageStatus === "PUBLISHED") return "已发布";
  if (row.media.storageStatus === "READY") return "已保存";
  if (row.media.storageStatus === "UPLOADED_PENDING_VALIDATION") return "服务端校验中";
  if (row.progress > 0) return `上传中 ${row.progress}%`;
  return "等待上传";
}
