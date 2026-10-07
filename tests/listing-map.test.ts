import { describe, expect, it } from "vitest";

import {
  getListingCoordinates,
  getListingPoint,
  getMapCenterForListings,
  getMapMarkers,
  getMapSummary,
  getMapTiles,
  mapTileUrl,
  maxMercatorLatitude,
  panMapCenter
} from "../lib/listing-map";

describe("listing map", () => {
  it("resolves Los Angeles neighborhood coordinates", () => {
    expect(getListingCoordinates("Los Angeles · Westwood")).toMatchObject({
      lat: 34.0635,
      lng: -118.4455
    });
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])("does not interpret inherited object property %s as a neighborhood", (name) => {
    const point = getListingCoordinates(`Los Angeles · ${name}`);
    expect(Number.isFinite(point.lat)).toBe(true);
    expect(Number.isFinite(point.lng)).toBe(true);
    expect(point.lat).toBeGreaterThan(33.9);
    expect(point.lat).toBeLessThan(34.2);
    expect(point.lng).toBeGreaterThan(-118.5);
    expect(point.lng).toBeLessThan(-118.1);
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

  it.each([
    [90, -118.4], [-90, -118.4], [85.06, -118.4], [-85.06, -118.4],
    [34, 181], [34, -181], [NaN, -118.4], [34, Infinity],
    [34, undefined], [undefined, -118.4]
  ])("uses the neighborhood fallback for a non-projectable coordinate pair (%s, %s)", (latitude, longitude) => {
    const listing = { id: "invalid", area: "Los Angeles · Westwood", price: 1680, latitude, longitude };
    const point = getListingCoordinates(listing.area);
    expect(getListingPoint(listing)).toEqual(point);
    expect(getMapCenterForListings([listing])).toEqual(point);
    const [marker] = getMapMarkers([listing], point, 12, { width: 640, height: 320 }, false);
    expect(marker).toMatchObject({ ...point, x: 320, y: 160 });
  });

  it("keeps Mercator boundary positions and dateline endpoints finite", () => {
    for (const lat of [-maxMercatorLatitude, maxMercatorLatitude]) {
      for (const lng of [-180, 180]) {
        const point = { lat, lng };
        const tiles = getMapTiles(point, 2, { width: 640, height: 360 });
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.every((tile) => Number.isFinite(tile.x) && Number.isFinite(tile.y))).toBe(true);
        expect(tiles.every((tile) => tile.yTile >= 0 && tile.yTile < 4)).toBe(true);
        const [marker] = getMapMarkers([{ id: "edge", area: "unknown", price: 1000, latitude: lat, longitude: lng }], point, 18, { width: 640, height: 360 }, false);
        expect(marker).toMatchObject({ lat, lng, x: 320, y: 180 });
      }
    }
  });

  it("replaces invalid map centers with a bounded fallback before generating tiles", () => {
    const safeTiles = getMapTiles({ lat: 34.0522, lng: -118.2437 }, 11, { width: 640, height: 360 });
    for (const center of [{ lat: 90, lng: 0 }, { lat: Infinity, lng: 0 }, { lat: 0, lng: NaN }, { lat: 0, lng: 1000 }]) {
      expect(getMapTiles(center, 11, { width: 640, height: 360 })).toEqual(safeTiles);
      expect(getMapCenterForListings([], center)).toEqual({ lat: 34.0522, lng: -118.2437 });
    }
  });

  it.each([NaN, Infinity, -1, 0, 1, 19, Number.MAX_VALUE])("rejects an unsupported map zoom %s before projection", (zoom) => {
    expect(() => getMapTiles({ lat: 34, lng: -118 }, zoom, { width: 640, height: 360 })).toThrow(RangeError);
    expect(() => getMapMarkers([], { lat: 34, lng: -118 }, zoom, { width: 640, height: 360 })).toThrow(RangeError);
    expect(() => panMapCenter({ lat: 34, lng: -118 }, zoom, 80, 0)).toThrow(RangeError);
  });

  it("accepts fractional zoom for moving markers while requesting only integer tile levels", () => {
    const point = { lat: 34, lng: -118 };
    const [marker] = getMapMarkers([{ id: "pinch", area: "LA", price: 1000, latitude: point.lat, longitude: point.lng }], point, 12.5, { width: 640.5, height: 320.5 }, false);
    expect(marker).toMatchObject({ x: 320, y: 160 });
    expect(Object.values(panMapCenter(point, 12.5, 80, 0)).every(Number.isFinite)).toBe(true);
    expect(() => getMapTiles(point, 12.5, { width: 640, height: 360 })).toThrow(RangeError);
    expect(() => mapTileUrl(1, 1, 12.5)).toThrow(RangeError);
    expect(getMapTiles(point, 18, { width: 640.5, height: 320.5 }).length).toBeGreaterThan(0);
  });

  it.each([
    { width: 0, height: 360 }, { width: -1, height: 360 },
    { width: 640, height: Infinity }, { width: NaN, height: 360 },
    { width: 8193, height: 360 }, { width: 640, height: Number.MAX_VALUE }
  ])("rejects invalid or excessive viewport dimensions %s", (size) => {
    expect(() => getMapTiles({ lat: 34, lng: -118 }, 11, size)).toThrow(RangeError);
    expect(() => getMapMarkers([], { lat: 34, lng: -118 }, 11, size)).toThrow(RangeError);
  });

  it("bounds tile work even when each viewport dimension is individually allowed", () => {
    expect(() => getMapTiles({ lat: 34, lng: -118 }, 11, { width: 8192, height: 8192 })).toThrow("tile budget");
    expect(getMapTiles({ lat: 34, lng: -118 }, 11, { width: 7680, height: 4320 }).length).toBeLessThanOrEqual(1024);
  });

  it.each([
    [-1, 1, 2], [1, -1, 2], [4, 1, 2], [1, 4, 2],
    [1.5, 1, 2], [1, NaN, 2], [1, 1, 19], [1, 1, Infinity]
  ])("rejects tile coordinates outside their finite integer zoom grid (%s,%s,%s)", (x, y, z) => {
    expect(() => mapTileUrl(x, y, z)).toThrow(RangeError);
  });

  it.each([
    "http://maps.example.com/{z}/{x}/{y}.png",
    "https://user:password@maps.example.com/{z}/{x}/{y}.png",
    "https://maps.example.com/{z}/{x}/{y}.png#secret",
    "https://{z}.example.com/{x}/{y}.png",
    "https://maps.example.com/{z}/{x}/{y}/{token}.png",
    "https://maps.example.com/{z}/{x}/{y}.png\n",
    "https://maps.example.com\\evil.example/{z}/{x}/{y}.png",
    "data:image/svg+xml,{z}/{x}/{y}",
    "//maps.example.com/{z}/{x}/{y}.png"
  ])("rejects an unsafe public tile URL template %s", (template) => {
    expect(() => mapTileUrl(1, 1, 2, template)).toThrow();
  });

  it("rejects nonfinite pan offsets and wraps valid pans across the dateline", () => {
    expect(() => panMapCenter({ lat: 34, lng: -118 }, 11, NaN, 0)).toThrow(RangeError);
    expect(() => panMapCenter({ lat: 34, lng: -118 }, 11, 0, Infinity)).toThrow(RangeError);
    const point = panMapCenter({ lat: 0, lng: 179.9 }, 2, -80, 0);
    expect(point.lng).toBeLessThan(0);
    expect(point.lng).toBeGreaterThanOrEqual(-180);
    expect(Math.abs(point.lat)).toBeLessThanOrEqual(maxMercatorLatitude);
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
