import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";

/** An empty style: the map can show pins at once while the real basemap downloads. */
export const emptyMapStyle: StyleSpecification = { version: 8, sources: {}, layers: [] };

/**
 * Lighter, quieter basemap for a price-pin map:
 * - no shop/restaurant icons (they compete with the pins and are the slowest labels to place); transit stays;
 * - no 3D buildings (heavy geometry; flat building shapes stay at every zoom);
 * - colours toned down here instead of with a CSS filter on the canvas, which made every frame of a drag slower.
 */
export function prepareBasemapStyle(style: StyleSpecification): StyleSpecification {
  const flatBuildingLayers = new Set(style.layers.filter((layer) => layer.type === "fill-extrusion").map((layer) => layer["source-layer"]).filter(Boolean));
  const layers = style.layers
    .filter((layer) => !(layer.type === "symbol" && layer["source-layer"] === "poi" && !layer.id.includes("transit")))
    .filter((layer) => layer.type !== "fill-extrusion")
    .map((layer): LayerSpecification => {
      // Keep flat buildings visible where the 3D layer used to take over.
      const next = layer.type === "fill" && flatBuildingLayers.has(layer["source-layer"]) && layer.maxzoom !== undefined
        ? (({ maxzoom: _maxzoom, ...rest }) => rest)(layer) as LayerSpecification
        : layer;
      if (next.type === "raster") return { ...next, paint: { ...next.paint, "raster-saturation": -0.45 } };
      if (!("paint" in next) || !next.paint) return next;
      const paint = Object.fromEntries(Object.entries(next.paint).map(([key, value]) => [key, key.endsWith("-color") ? toneColors(value) : value]));
      return { ...next, paint } as LayerSpecification;
    });
  return { ...style, layers };
}

function toneColors(value: unknown): unknown {
  if (typeof value === "string") return toneColor(value) ?? value;
  if (Array.isArray(value)) return value.map(toneColors);
  if (value && typeof value === "object" && "stops" in value && Array.isArray((value as { stops: unknown }).stops)) {
    return { ...value, stops: (value as { stops: [unknown, unknown][] }).stops.map(([at, color]) => [at, toneColors(color)]) };
  }
  return value;
}

/**
 * Same look as the old canvas filter `saturate(0.55) contrast(0.96) brightness(1.03)`, applied to one colour with the
 * CSS filter formulas.
 */
export function toneColor(input: string): string | undefined {
  const rgba = parseColor(input);
  if (!rgba) return undefined;
  const [r, g, b, a] = rgba.map((value, index) => index < 3 ? value / 255 : value);
  const s = 0.55;
  const saturated = [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b
  ];
  const [nr, ng, nb] = saturated.map((value) => Math.round(Math.min(1, Math.max(0, ((value - 0.5) * 0.96 + 0.5) * 1.03)) * 255));
  return a < 1 ? `rgba(${nr},${ng},${nb},${Number(a.toFixed(3))})` : `rgb(${nr},${ng},${nb})`;
}

function parseColor(input: string): [number, number, number, number] | undefined {
  const value = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    const [r, g, b, a = 255] = full.match(/../g)!.map((pair) => parseInt(pair, 16));
    return [r, g, b, a / 255];
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (!fn) return undefined;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return undefined;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if (!Number.isFinite(alpha)) return undefined;
  if (fn[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((part) => part.endsWith("%") ? parseFloat(part) * 2.55 : parseFloat(part));
    return [r, g, b].every(Number.isFinite) ? [r, g, b, alpha] : undefined;
  }
  const [h, s, l] = [parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100];
  if (![h, s, l].every(Number.isFinite)) return undefined;
  return [...hslToRgb(((h % 360) + 360) % 360 / 360, s, l), alpha];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
    return Math.round(v * 255);
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function fetchJson<T>(url: string, fetcher: Fetcher, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Basemap request failed with ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads a vector style and the tile descriptions it points to, so MapLibre can request tiles straight away
 * instead of waiting for two more round trips. Each request is retried with a timeout, because the free basemap
 * server is sometimes slow; a style that still cannot be loaded rejects, and the caller shows a retry button.
 */
export async function loadBasemapStyle(style: string | StyleSpecification, {
  fetcher = (input, init) => fetch(input, init),
  timeoutMs = 6000,
  attempts = 3,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
}: { fetcher?: Fetcher; timeoutMs?: number; attempts?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<StyleSpecification> {
  if (typeof style !== "string") return style;
  const retry = async <T>(task: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt += 1) {
      try { return await task(); } catch (error) {
        if (attempt >= attempts) throw error;
        await wait(attempt * 700);
      }
    }
  };
  const loaded = await retry(() => fetchJson<StyleSpecification>(style, fetcher, timeoutMs));
  if (loaded?.version !== 8 || !Array.isArray(loaded.layers) || !loaded.sources) throw new Error("Basemap style is not a MapLibre style");
  const sources = Object.fromEntries(await Promise.all(Object.entries(loaded.sources).map(async ([id, source]): Promise<[string, SourceSpecification]> => {
    if (!("url" in source) || typeof source.url !== "string" || !["vector", "raster", "raster-dem"].includes(source.type)) return [id, source];
    const url = new URL(source.url, style).href;
    try {
      const tileJson = await retry(() => fetchJson<{ tiles?: string[]; minzoom?: number; maxzoom?: number; bounds?: [number, number, number, number]; attribution?: string; scheme?: "xyz" | "tms" }>(url, fetcher, timeoutMs));
      if (!Array.isArray(tileJson.tiles) || !tileJson.tiles.length) return [id, { ...source, url }];
      const { url: _url, ...rest } = source;
      return [id, {
        ...rest,
        tiles: tileJson.tiles.map((tile) => new URL(tile, url).href.replace(/%7B/g, "{").replace(/%7D/g, "}")),
        ...(tileJson.minzoom !== undefined ? { minzoom: tileJson.minzoom } : {}),
        ...(tileJson.maxzoom !== undefined ? { maxzoom: tileJson.maxzoom } : {}),
        ...(tileJson.bounds ? { bounds: tileJson.bounds } : {}),
        ...(tileJson.scheme ? { scheme: tileJson.scheme } : {}),
        ...(tileJson.attribution && !("attribution" in rest && rest.attribution) ? { attribution: tileJson.attribution } : {})
      } as SourceSpecification];
    } catch {
      // MapLibre can still fetch the description itself.
      return [id, { ...source, url }];
    }
  })));
  const absolute = (value: unknown) => typeof value === "string" ? new URL(value.replace(/\{/g, "%7B").replace(/\}/g, "%7D"), style).href.replace(/%7B/g, "{").replace(/%7D/g, "}") : value;
  return prepareBasemapStyle({
    ...loaded,
    sources,
    ...(typeof loaded.glyphs === "string" ? { glyphs: absolute(loaded.glyphs) as string } : {}),
    ...(typeof loaded.sprite === "string" ? { sprite: absolute(loaded.sprite) as string } : {})
  });
}
