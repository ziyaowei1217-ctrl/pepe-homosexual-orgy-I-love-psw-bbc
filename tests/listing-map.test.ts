import { describe, expect, it } from "vitest";

import { getListingCoordinates, getMapCenterForListings, getMapMarkers, getMapTiles, osmTileUrl } from "../lib/listing-map";

describe("listing map", () => {
  it("resolves Los Angeles neighborhood coordinates", () => {
    expect(getListingCoordinates("Los Angeles · Westwood")).toMatchObject({
      lat: 34.0635,
      lng: -118.4455
    });
  });

  it("projects listing markers into the map viewport", () => {
    const listings = [
      { id: "westwood", area: "Los Angeles · Westwood", price: 1680 },
      { id: "santa-monica", area: "Los Angeles · Santa Monica", price: 2380 }
    ];
    const center = getMapCenterForListings(listings);
    const markers = getMapMarkers(
      listings,
      center,
      11,
      { width: 640, height: 360 }
    );

    expect(markers).toHaveLength(2);
    expect(markers.every((marker) => marker.x >= 0 && marker.x <= 640)).toBe(true);
    expect(markers.every((marker) => marker.y >= 0 && marker.y <= 360)).toBe(true);
  });

  it("keeps edge marker labels inside the visible map", () => {
    const [marker] = getMapMarkers(
      [{ id: "santa-monica", area: "Los Angeles · Santa Monica", price: 2380 }],
      { lat: 34.0522, lng: -118.2437 },
      11,
      { width: 640, height: 360 }
    );

    expect(marker.x).toBeGreaterThanOrEqual(64);
    expect(marker.x).toBeLessThanOrEqual(576);
    expect(marker.y).toBeGreaterThanOrEqual(28);
    expect(marker.y).toBeLessThanOrEqual(332);
  });

  it("builds OSM tile URLs around the current map center", () => {
    const tiles = getMapTiles({ lat: 34.0522, lng: -118.2437 }, 11, { width: 640, height: 360 });

    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles[0].url).toBe(osmTileUrl(tiles[0].xTile, tiles[0].yTile, 11));
  });
});
