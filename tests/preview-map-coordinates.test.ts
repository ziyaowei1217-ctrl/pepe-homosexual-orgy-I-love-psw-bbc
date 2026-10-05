import { describe, expect, it } from "vitest";

import { getListingCoordinates, getMapCenterForListings, getMapMarkers } from "../lib/listing-map";
import { createPreviewListings } from "../lib/preview-data";

const losAngelesListings = createPreviewListings().filter((listing) => listing.area.startsWith("Los Angeles ·"));

describe("Los Angeles preview map coordinates", () => {
  it("uses the public neighborhood center exactly for all 24 fixtures", () => {
    expect(losAngelesListings).toHaveLength(24);

    for (const listing of losAngelesListings) {
      expect({ lat: listing.latitude, lng: listing.longitude }, listing.area)
        .toEqual(getListingCoordinates(listing.area));
    }
  });

  it("keeps every fixture within Los Angeles and safe for Mercator projection", () => {
    for (const listing of losAngelesListings) {
      expect(Number.isFinite(listing.latitude), listing.area).toBe(true);
      expect(Number.isFinite(listing.longitude), listing.area).toBe(true);
      expect(Math.abs(listing.latitude), listing.area).toBeLessThan(85.05112878);
      expect(listing.latitude, listing.area).toBeGreaterThan(33.8);
      expect(listing.latitude, listing.area).toBeLessThan(34.3);
      expect(listing.longitude, listing.area).toBeGreaterThan(-118.6);
      expect(listing.longitude, listing.area).toBeLessThan(-118);
    }

    const markers = getMapMarkers(
      losAngelesListings,
      getMapCenterForListings(losAngelesListings),
      12,
      { width: 640, height: 360 },
      false
    );
    expect(markers).toHaveLength(24);
    for (const [index, marker] of markers.entries()) {
      const listing = losAngelesListings[index];
      expect(Number.isFinite(marker.x), listing.area).toBe(true);
      expect(Number.isFinite(marker.y), listing.area).toBe(true);
      expect({ lat: marker.lat, lng: marker.lng }, listing.area)
        .toEqual({ lat: listing.latitude, lng: listing.longitude });
    }
  });

  it("does not recreate the original index-generated diagonal", () => {
    for (const [index, listing] of losAngelesListings.entries()) {
      expect({ lat: listing.latitude, lng: listing.longitude }, listing.area).not.toEqual({
        lat: Number((33.9 + index * 0.011).toFixed(4)),
        lng: Number((-118.52 + index * 0.013).toFixed(4))
      });
    }
  });

  it.each([
    ["Westwood", { lat: 34.0635, lng: -118.4455 }],
    ["Santa Monica", { lat: 34.0195, lng: -118.4912 }],
    ["Venice", { lat: 33.9925, lng: -118.4695 }],
    ["Palms", { lat: 34.0234, lng: -118.407 }],
    ["Century City", { lat: 34.0555, lng: -118.4179 }],
    ["Highland Park", { lat: 34.1119, lng: -118.1986 }]
  ] as const)("places %s at its neighborhood center without perturbations", (neighborhood, center) => {
    const area = `Los Angeles · ${neighborhood}`;
    const listing = losAngelesListings.find((item) => item.area === area);

    expect(listing).toBeDefined();
    expect(getListingCoordinates(area)).toEqual(center);
    expect({ lat: listing!.latitude, lng: listing!.longitude }).toEqual(center);
  });
});
