// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Image from "../components/ui/app-image";
import { SmartImage } from "../components/ui/smart-image";
import { HomeExperience } from "../components/marketplace/home-experience";
import { ListingPhotoGallery } from "../components/marketplace/listing-photo-gallery";
import { isFirstPartyListingMedia } from "../lib/listing-image-policy";
import { createPreviewListings } from "../lib/preview-data";

const apiBaseUrl = "https://api.example.com:444/api/v1";
const publicPhoto = `${apiBaseUrl}/listing-media/media-a/content`;
const imageConfig = {
  ...imageConfigDefault,
  unoptimized: false,
  localPatterns: [],
  remotePatterns: [{ protocol: "https" as const, hostname: "images.unsplash.com" }]
};

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", apiBaseUrl); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

function imagesIn(element: React.ReactNode) {
  const html = renderToStaticMarkup(<ImageConfigContext.Provider value={imageConfig}>{element}</ImageConfigContext.Provider>);
  return Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("img"));
}

describe("revocable listing image requests", () => {
  it("keeps refreshed images visible in initial HTML and preserves direct revocable-media requests", () => {
    const [image] = imagesIn(<SmartImage src={publicPhoto} alt="Listing photo" width={400} height={300} unoptimized={false} />);
    expect(image.getAttribute("src")).toBe(publicPhoto);
    expect(image.getAttribute("srcset")).toBeNull();
    expect(image.classList.contains("opacity-0")).toBe(false);
  });

  it("contains a failed image placeholder and recovers when its source changes", () => {
    const { rerender } = render(<SmartImage src={publicPhoto} alt="Listing photo" width={400} height={300} className="h-36" />);
    fireEvent.error(screen.getByAltText("Listing photo"));
    const placeholder = screen.getByRole("img", { name: "Listing photo" });
    expect(placeholder.tagName).toBe("SPAN");
    expect(placeholder.classList.contains("absolute")).toBe(false);
    expect(placeholder.classList.contains("h-36")).toBe(true);
    const replacementPhoto = `${apiBaseUrl}/listing-media/media-b/content`;
    rerender(<SmartImage src={replacementPhoto} alt="Listing photo" width={400} height={300} />);
    expect(screen.getByAltText("Listing photo").getAttribute("src")).toBe(replacementPhoto);
    expect(screen.getByAltText("Listing photo").getAttribute("srcset")).toBeNull();
  });

  it.each([publicPhoto, "/api/v1/listing-media/media-a/content"]) (
    "renders %s directly even when a caller requests optimization",
    (src) => {
      const [image] = imagesIn(<Image src={src} alt="Listing photo" width={400} height={300} unoptimized={false} />);
      expect(image.getAttribute("src")).toBe(src);
      expect(image.getAttribute("srcset")).toBeNull();
      expect(image.getAttribute("loading")).toBe("lazy");
    }
  );

  it("preserves optimized Unsplash sizes", () => {
    const src = "https://images.unsplash.com/photo-example?auto=format&w=1200";
    const [image] = imagesIn(<Image src={src} alt="Demo photo" width={400} height={300} />);
    expect(image.getAttribute("src")).toContain(`/_next/image?url=${encodeURIComponent(src)}`);
    expect(image.getAttribute("srcset")).toContain("/_next/image?");
    expect(image.getAttribute("srcset")).toContain("2x");
  });

  it("routes real listing cards and the gallery to the revocation-aware API", () => {
    const listing = { ...createPreviewListings()[0], image: publicPhoto, images: [publicPhoto] };
    const images = imagesIn(<><HomeExperience listings={[listing]} /><ListingPhotoGallery listing={listing} /></>);
    expect(images.length).toBeGreaterThan(1);
    for (const image of images) {
      expect(image.getAttribute("src")).toBe(publicPhoto);
      expect(image.getAttribute("srcset")).toBeNull();
    }
  });

  it.each([
    "https://api.example.com.evil.test:444/api/v1/listing-media/media-a/content",
    "https://api.example.com/api/v1/listing-media/media-a/content",
    `${apiBaseUrl}/listing-media/media-a/admin-preview`,
    "/api/v1/listing-media/media-a/content/extra",
    "/api/v1/listing-media/media-a/other/content",
    "javascript:alert(1)"
  ])("does not classify unrelated source %s as first-party listing content", (src) => {
    expect(isFirstPartyListingMedia(src)).toBe(false);
  });
});
