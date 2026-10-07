"use client";

import { ImageOff } from "lucide-react";
import type { ImageProps } from "next/image";
import Image from "@/components/ui/app-image";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
/**
 * The first-party media policy is preserved; a quiet placeholder appears when the source
 * is missing or fails. Initial HTML keeps the image visible before hydration.
 */
export function SmartImage({ className, alt, src, onLoad, onError, ...props }: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps["src"] | null>(null);
  const failed = !src || failedSrc === src;
  const handleLoad = useCallback<NonNullable<ImageProps["onLoad"]>>((event) => {
    // next/image replays onLoad for images that settled before hydration, including broken ones.
    if (event.currentTarget.naturalWidth === 0) {
      setFailedSrc(src);
      return;
    }
    onLoad?.(event);
  }, [src, onLoad]);
  // Next Image reattaches its image ref when onError changes and resets src.
  // Keep an unchanged photo's request intact during surrounding UI updates.
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
        className={cn("photo-placeholder grid place-items-center text-[#6b7493]", props.fill ? "absolute inset-0" : "max-w-full", className)}
        style={!props.fill && Number(props.width) > 0 && Number(props.height) > 0
          ? { aspectRatio: `${Number(props.width)} / ${Number(props.height)}`, ...props.style }
          : props.style}
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
      className={className}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
