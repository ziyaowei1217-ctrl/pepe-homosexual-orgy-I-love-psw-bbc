import { describe, expect, it } from "vitest";
import { clusterSearchMarkers } from "../lib/search-map-clusters";
import { getMapMarkers, getMapTiles, panMapCenter } from "../lib/listing-map";

describe("search map positions", () => {
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
