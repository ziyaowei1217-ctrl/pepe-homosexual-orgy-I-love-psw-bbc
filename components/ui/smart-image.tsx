"use client";

import { ImageOff } from "lucide-react";
import Image, { type ImageProps } from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * next/image with a fade-in on load and a quiet placeholder when the source
 * is missing or fails, so cards never show a broken-image icon with raw alt text.
 */
export function SmartImage({ className, alt, src, onLoad, onError, ...props }: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps["src"] | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<ImageProps["src"] | null>(null);
  const failed = !src || failedSrc === src;

  if (failed) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className="photo-placeholder absolute inset-0 grid place-items-center text-[#6b7493]"
      >
        <ImageOff className="size-7" aria-hidden="true" />
      </span>
    );
  }

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      className={cn("transition-opacity duration-500", loadedSrc === src ? "opacity-100" : "opacity-0", className)}
      onLoad={(event) => {
        // next/image replays onLoad for images that settled before hydration, including broken ones.
        if (event.currentTarget.naturalWidth === 0) {
          setFailedSrc(src);
          return;
        }
        setLoadedSrc(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}
