import { describe, expect, it } from "vitest";

import {
  defaultMapStyleUrl,
  formatMapBounds,
  getApproximateListingCoordinates,
  getListingCoordinates,
  getMapStyle,
  getListingPoint,
  parseMapBounds
} from "../lib/listing-map";

describe("listing map", () => {
  it("uses a listing's own coordinates before its neighbourhood", () => {
    expect(getListingPoint({ id: "seattle-custom", area: "Seattle · Custom district", price: 2100, latitude: 47.62, longitude: -122.31 }))
      .toEqual({ lat: 47.62, lng: -122.31 });
  });

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







  it("gives listings in one neighbourhood their own stable spot within about 300 m", () => {
    const centre = getListingCoordinates("Los Angeles · Westwood");
    const first = getApproximateListingCoordinates("listing-a", "Los Angeles · Westwood");
    const second = getApproximateListingCoordinates("listing-b", "Los Angeles · Westwood");

    expect(getApproximateListingCoordinates("listing-a", "Los Angeles · Westwood")).toEqual(first);
    expect(second).not.toEqual(first);
    for (const point of [first, second]) {
      expect(Math.abs(point.lat - centre.lat)).toBeLessThanOrEqual(0.0025);
      expect(Math.abs(point.lng - centre.lng)).toBeLessThanOrEqual(0.003);
    }
  });

  it("reads and writes the map area for the address bar and rejects bad areas", () => {
    expect(parseMapBounds(formatMapBounds([-118.51234, 33.9, -118.2, 34.1]))).toEqual([-118.5123, 33.9, -118.2, 34.1]);
    expect(parseMapBounds("-118.2,34,-118.5,34.1")).toBeNull();
    expect(parseMapBounds("1,2,3")).toBeNull();
    expect(parseMapBounds("a,b,c,d")).toBeNull();
    expect(parseMapBounds(null)).toBeNull();
  });

  it("picks a vector style, then a raster tile template, then OpenFreeMap", () => {
    expect(getMapStyle("https://maps.example.com/style.json", "https://tiles.example.com/{z}/{x}/{y}.png")).toBe("https://maps.example.com/style.json");
    expect(getMapStyle("", "https://tiles.example.com/{z}/{x}/{y}.png", "© Example")).toMatchObject({
      sources: { basemap: { type: "raster", tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"], attribution: "© Example" } }
    });
    expect(getMapStyle("", "")).toBe(defaultMapStyleUrl);
  });
});
