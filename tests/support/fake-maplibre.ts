/**
 * Stand-in for maplibre-gl in jsdom, which has no WebGL: just enough of Map, Marker and Popup for the listing map.
 * Use with `vi.mock("maplibre-gl", () => import("./support/fake-maplibre"))`; `FakeMap.last` is the newest map.
 */
type Bounds = [number, number, number, number];
type Listener = (event: Record<string, unknown>) => void;

export const getVersion = () => "6.4.1";
export function setWorkerUrl(_url: string) {}

export class Map {
  static last: Map | null = null;
  container: HTMLElement;
  bounds: Bounds;
  zoom: number;
  touchZoomRotate = { disableRotation() {} };
  keyboard = { disableRotation() {} };
  private listeners = new globalThis.Map<string, Set<Listener>>();
  private resizeObserver?: ResizeObserver;

  constructor(options: { container: HTMLElement; bounds?: Bounds; center?: [number, number]; zoom?: number; trackResize?: boolean }) {
    this.container = options.container;
    const [lng, lat] = options.center ?? [0, 0];
    // A little room around fitted bounds, as MapLibre's fit padding gives.
    const [west, south, east, north] = options.bounds ?? [lng, lat, lng, lat];
    this.bounds = [west - 0.05, south - 0.05, east + 0.05, north + 0.05];
    // Past the clustering zoom, so every listing gets its own price pin.
    this.zoom = options.bounds ? 15 : options.zoom ?? 15;
    Map.last = this;
    // MapLibre's automatic resize has no application event tag.
    if (options.trackResize !== false && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
  }

  on(type: string, listener: Listener) { this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener)); return this; }
  once(type: string, listener: Listener) { return this.on(type, listener); }
  off(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); return this; }
  fire(type: string, data: Record<string, unknown> = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ type, ...data }); }

  getBounds() {
    const [west, south, east, north] = this.bounds;
    return {
      getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north,
      contains: ([lng, lat]: [number, number]) => lng >= west && lng <= east && lat >= south && lat <= north
    };
  }
  getZoom() { return this.zoom; }

  /** A drag by the user: new bounds, then move and moveend without `fromCode`. */
  moveTo(bounds: Bounds) { this.bounds = bounds; this.fire("move"); this.fire("moveend"); }
  fitBounds([west, south, east, north]: Bounds, _options?: unknown, data?: Record<string, unknown>) {
    this.bounds = [west - 0.05, south - 0.05, east + 0.05, north + 0.05];
    this.fire("move", data);
    this.fire("moveend", data);
  }
  easeTo(_options: unknown, data?: Record<string, unknown>) { this.fire("move", data); this.fire("moveend", data); }
  zoomIn() { this.zoom += 1; this.fire("moveend"); }
  zoomOut() { this.zoom -= 1; this.fire("moveend"); }
  resize(data: Record<string, unknown> = {}) { this.fire("moveend", data); }
  remove() { this.resizeObserver?.disconnect(); this.listeners.clear(); }
}

export class Marker {
  element: HTMLElement;
  constructor({ element }: { element: HTMLElement }) { this.element = element; }
  setLngLat() { return this; }
  addTo(map: Map) { map.container.appendChild(this.element); return this; }
  remove() { this.element.remove(); }
}

export class Popup {
  node: HTMLElement | null = null;
  setLngLat() { return this; }
  setDOMContent(node: HTMLElement) { this.node = node; return this; }
  addTo(map: Map) { if (this.node) map.container.appendChild(this.node); return this; }
  remove() { this.node?.remove(); }
}
