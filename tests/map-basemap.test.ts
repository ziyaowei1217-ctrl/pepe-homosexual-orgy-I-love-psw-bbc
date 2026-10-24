import { describe, expect, it, vi } from "vitest";
import type { StyleSpecification } from "maplibre-gl";

import { loadBasemapStyle, prepareBasemapStyle, toneColor } from "@/lib/map-basemap";

const style = {
  version: 8,
  glyphs: "/fonts/{fontstack}/{range}.pbf",
  sprite: "https://tiles.example.org/sprites/liberty",
  sources: { openmaptiles: { type: "vector", url: "https://tiles.example.org/planet" }, ne: { type: "raster", tiles: ["https://tiles.example.org/ne/{z}/{x}/{y}.png"] } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "natural_earth", type: "raster", source: "ne" },
    { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": ["interpolate", ["linear"], ["zoom"], 5, "rgba(200, 250, 160, 0.5)", 12, "hsl(100, 60%, 70%)"] } },
    { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", maxzoom: 14, paint: { "fill-color": "#dfdbd7" } },
    { id: "building-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14, paint: { "fill-extrusion-color": "#e0dcd8" } },
    { id: "poi_r1", type: "symbol", source: "openmaptiles", "source-layer": "poi", layout: { "icon-image": "{class}" }, paint: { "text-color": "#666" } },
    { id: "poi_transit", type: "symbol", source: "openmaptiles", "source-layer": "poi", layout: { "icon-image": "{class}" }, paint: { "text-color": "#2e5a80" } }
  ]
} as StyleSpecification;

describe("basemap", () => {
  it("tones colours down like the old canvas filter", () => {
    expect(toneColor("#ff0000")).toBe("rgb(168,29,29)");
    expect(toneColor("#ffffff")).toBe("rgb(255,255,255)");
    expect(toneColor("rgba(0, 0, 255, 0.5)")).toBe("rgba(13,13,152,0.5)");
    expect(toneColor("hsl(0, 0%, 50%)")).toBe("rgb(132,132,132)");
    expect(toneColor("{class}")).toBeUndefined();
  });

  it("drops shop icons and 3D buildings but keeps transit and flat buildings at every zoom", () => {
    const prepared = prepareBasemapStyle(style);
    expect(prepared.layers.map((layer) => layer.id)).toEqual(["background", "natural_earth", "park", "building", "poi_transit"]);
    expect(prepared.layers.find((layer) => layer.id === "building")).not.toHaveProperty("maxzoom");
    expect(prepared.layers.find((layer) => layer.id === "natural_earth")).toMatchObject({ paint: { "raster-saturation": -0.45 } });
    expect(JSON.stringify(prepared.layers.find((layer) => layer.id === "park"))).not.toContain("rgba(200, 250, 160");
  });

  it("inlines the tile description, so tiles can be requested straight away", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/planet")
      ? Response.json({ tiles: ["https://tiles.example.org/planet/20261020/{z}/{x}/{y}.pbf"], maxzoom: 14, attribution: "© OSM" })
      : Response.json(style));
    const loaded = await loadBasemapStyle("https://tiles.example.org/styles/liberty", { fetcher });
    expect(loaded.sources.openmaptiles).toEqual({ type: "vector", tiles: ["https://tiles.example.org/planet/20261020/{z}/{x}/{y}.pbf"], maxzoom: 14, attribution: "© OSM" });
    expect(loaded.glyphs).toBe("https://tiles.example.org/fonts/{fontstack}/{range}.pbf");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries a slow or failing server, then gives up so the page can offer a retry", async () => {
    let calls = 0;
    const flaky = vi.fn(async (url: string) => {
      calls += 1;
      if (url.endsWith("/liberty") && calls === 1) throw new Error("timeout");
      return url.endsWith("/planet") ? new Response("", { status: 503 }) : Response.json(style);
    });
    const loaded = await loadBasemapStyle("https://tiles.example.org/styles/liberty", { fetcher: flaky, wait: async () => {} });
    // The tile description failed every time: MapLibre is left to fetch it itself.
    expect(loaded.sources.openmaptiles).toEqual({ type: "vector", url: "https://tiles.example.org/planet" });

    const down = vi.fn(async () => new Response("", { status: 503 }));
    await expect(loadBasemapStyle("https://tiles.example.org/styles/liberty", { fetcher: down, wait: async () => {} })).rejects.toThrow("503");
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("times out a request that never answers", async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(loadBasemapStyle("https://tiles.example.org/styles/liberty", { fetcher: hang, timeoutMs: 5, attempts: 2, wait: async () => {} })).rejects.toThrow("aborted");
    expect(hang).toHaveBeenCalledTimes(2);
  });
});
