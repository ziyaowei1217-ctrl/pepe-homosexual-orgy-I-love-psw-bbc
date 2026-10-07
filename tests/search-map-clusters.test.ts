import { describe, expect, it } from "vitest";
import { clusterSearchMarkers } from "../lib/search-map-clusters";
import { getMapCenterForListings, getMapMarkers, getMapTiles, panMapCenter } from "../lib/listing-map";

describe("search map positions", () => {
  it("centers dateline neighbors on the short arc and keeps their pins together", () => {
    const listings = [
      { id: "east", area: "Pacific", price: 1500, latitude: 10, longitude: 179 },
      { id: "west", area: "Pacific", price: 1800, latitude: 10, longitude: -179 }
    ];
    const center = getMapCenterForListings(listings);
    expect(Math.abs(center.lng)).toBe(180);
    expect(getMapCenterForListings([...listings].reverse())).toEqual(center);
    const markers = getMapMarkers(listings, center, 2, { width: 800, height: 600 }, false);
    expect(Math.abs(markers[0].x - markers[1].x)).toBeLessThan(10);
    expect(markers.every((marker) => marker.x > 390 && marker.x < 410)).toBe(true);
    const tiles = getMapTiles(center, 2, { width: 800, height: 600 });
    expect(tiles.every((tile) => /^https:\/\/tile\.openstreetmap\.de\/2\/[0-3]\/[0-3]\.png$/.test(tile.url))).toBe(true);
  });

  it("uses valid tile coordinates when zooming out beyond the world bounds", () => {
    const tiles = getMapTiles({ lat: 75, lng: -170 }, 2, { width: 1500, height: 1000 });
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      const [, , x, y] = new URL(tile.url).pathname.split("/");
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThan(4);
      expect(Number(y.replace(".png", ""))).toBeGreaterThanOrEqual(0);
      expect(Number(y.replace(".png", ""))).toBeLessThan(4);
    }
  });
  it("groups overlapping pins while retaining every listing for the picker", () => {
    const markers = getMapMarkers([
      { id: "a", area: "Westwood", price: 1500, latitude: 34.05, longitude: -118.4 },
      { id: "b", area: "Westwood", price: 1800, latitude: 34.05, longitude: -118.4 },
      { id: "c", area: "Pasadena", price: 2100, latitude: 34.15, longitude: -118.14 }
    ], { lat: 34.05, lng: -118.4 }, 11, { width: 800, height: 600 }, false);
    const clusters = clusterSearchMarkers(markers);
    expect(clusters.map((cluster) => cluster.items.map((item) => item.id))).toEqual([["a", "b"], ["c"]]);
    expect(clusters[0].x).toBe(400);
    expect(clusters[0].y).toBe(300);
  });

  it("keeps cluster membership and centers stable under sorting while preserving picker order", () => {
    const base = getMapMarkers([{ id: "base", area: "Westwood", price: 1500 }], { lat: 34.0635, lng: -118.4455 }, 11, { width: 800, height: 600 }, false)[0];
    const markers = [
      { ...base, id: "a", x: 0, y: 100, price: 1500 },
      { ...base, id: "b", x: 80, y: 100, price: 1800 },
      { ...base, id: "c", x: 160, y: 100, price: 2100 }
    ];
    const expected = [{ ids: ["a", "b"], x: 40, y: 100 }, { ids: ["c"], x: 160, y: 100 }];
    for (const input of [markers, [...markers].reverse(), [markers[1], markers[2], markers[0]]]) {
      const original = [...input];
      const groups = clusterSearchMarkers(input);
      expect(groups.map((group) => ({ ids: group.items.map((item) => item.id).sort(), x: group.x, y: group.y }))).toEqual(expected);
      for (const group of groups) {
        expect(group.items).toEqual(input.filter((item) => group.items.some((member) => member.id === item.id)));
      }
      expect(input).toEqual(original);
      expect(groups.flatMap((group) => group.items).map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("keeps offscreen homes at their projected locations rather than pinning them to the edge", () => {
    const [marker] = getMapMarkers([{ id: "ny", area: "New York", price: 2000, latitude: 40.71, longitude: -74 }], { lat: 34, lng: -118 }, 11, { width: 400, height: 600 }, false);
    expect(marker.x).toBeGreaterThan(400);
  });

  it("moves tiles and markers by the same pixel displacement when panning", () => {
    const center = { lat: 34.05, lng: -118.4 };
    const moved = panMapCenter(center, 11, 100, 60);
    const [marker] = getMapMarkers([{ id: "a", area: "Westwood", price: 1500, latitude: center.lat, longitude: center.lng }], moved, 11, { width: 800, height: 600 }, false);
    expect(marker.x).toBe(500);
    expect(marker.y).toBe(360);
  });
});
