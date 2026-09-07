import { describe, expect, it } from "vitest";

import {
  getListingCoordinates,
  getMapCenterForListings,
  getMapMarkers,
  getMapSummary,
  getMapTiles,
  mapTileUrl
} from "../lib/listing-map";

describe("listing map", () => {
  it("resolves Los Angeles neighborhood coordinates", () => {
    expect(getListingCoordinates("Los Angeles · Westwood")).toMatchObject({
      lat: 34.0635,
      lng: -118.4455
    });
  });

  it("resolves Boston neighborhood coordinates instead of falling back to Los Angeles", () => {
    expect(getListingCoordinates("Boston · Back Bay")).toMatchObject({
      lat: 42.3503,
      lng: -71.081
    });
  });

  it("keeps nationwide metro neighborhoods near their own city centers", () => {
    const seattle = getListingCoordinates("Seattle · University District");
    const newYork = getListingCoordinates("New York · Morningside Heights");

    expect(seattle.lat).toBeGreaterThan(47.5);
    expect(seattle.lat).toBeLessThan(47.8);
    expect(seattle.lng).toBeGreaterThan(-122.5);
    expect(seattle.lng).toBeLessThan(-122.1);
    expect(newYork.lat).toBeGreaterThan(40.6);
    expect(newYork.lat).toBeLessThan(40.9);
    expect(newYork.lng).toBeGreaterThan(-74.2);
    expect(newYork.lng).toBeLessThan(-73.7);
  });

  it("uses listing coordinates as the source of truth for map center and markers", () => {
    const listings = [{
      id: "seattle-custom",
      area: "Seattle · Custom district",
      price: 2100,
      latitude: 47.62,
      longitude: -122.31
    }];

    expect(getMapCenterForListings(listings)).toEqual({ lat: 47.62, lng: -122.31 });
    expect(getMapMarkers(listings, { lat: 47.62, lng: -122.31 }, 11, { width: 640, height: 360 })[0])
      .toMatchObject({ lat: 47.62, lng: -122.31, x: 320, y: 180 });
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
    expect(markers.every((marker) => Number.isInteger(marker.x) && Number.isInteger(marker.y))).toBe(true);
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

  it("uses the unblocked default basemap provider around the current map center", () => {
    const tiles = getMapTiles({ lat: 34.0522, lng: -118.2437 }, 11, { width: 640, height: 360 });

    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles[0].url).toBe(
      `https://tile.openstreetmap.de/11/${tiles[0].xTile}/${tiles[0].yTile}.png`
    );
    expect(tiles.every((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y))).toBe(true);
  });

  it("supports a production map-provider tile template", () => {
    expect(mapTileUrl(4, 5, 6, "https://maps.example.com/{z}/{x}/{y}.png?key=public"))
      .toBe("https://maps.example.com/6/4/5.png?key=public");
  });

  it("summarizes visible listing prices for the map header", () => {
    expect(
      getMapSummary([
        { id: "westwood", area: "Los Angeles · Westwood", price: 1800 },
        { id: "dtla", area: "Los Angeles · DTLA", price: 2600 },
        { id: "usc", area: "Los Angeles · USC North", price: 1400 }
      ])
    ).toEqual({
      count: 3,
      averagePrice: 1933,
      minimumPrice: 1400
    });

    expect(getMapSummary([])).toEqual({
      count: 0,
      averagePrice: 0,
      minimumPrice: 0
    });
  });
});
