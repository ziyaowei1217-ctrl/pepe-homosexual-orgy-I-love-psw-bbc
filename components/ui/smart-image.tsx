"use client";

import { ImageOff } from "lucide-react";
import Image, { type ImageProps } from "next/image";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import { isTrustedImageSource } from "@/lib/image-source";

/**
 * next/image with a fade-in on load and a quiet placeholder when the source
 * is missing or fails, so cards never show a broken-image icon with raw alt text.
 */
export function SmartImage({ className, alt, src, onLoad, onError, ...props }: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps["src"] | null>(null);
  const failed = !src || failedSrc === src || (typeof src === "string" && !isTrustedImageSource(src));
  const handleLoad = useCallback<NonNullable<ImageProps["onLoad"]>>((event) => {
    if (event.currentTarget.naturalWidth === 0) { setFailedSrc(src); return; }
    onLoad?.(event);
  }, [src, onLoad]);
  const handleError = useCallback<NonNullable<ImageProps["onError"]>>((event) => {
    setFailedSrc(src);
    onError?.(event);
  }, [src, onError]);

  if (failed) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className="photo-placeholder absolute inset-0 grid place-items-center text-ink-secondary"
      >
        <ImageOff className="size-7" aria-hidden="true" />
      </span>
    );
  }

  return (
    <Image
      {...props}
      unoptimized={props.unoptimized || (typeof src === "string" && (src.startsWith("/api/") || (!src.startsWith("/") && !src.startsWith("https://images.unsplash.com/"))))}
      src={src}
      alt={alt}
      className={cn("opacity-100", className)}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
