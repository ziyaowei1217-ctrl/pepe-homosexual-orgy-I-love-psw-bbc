// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractiveMapSurface, type InteractiveMapSurfaceHandle, type MapViewport } from "../components/marketplace/interactive-map-surface";

type Listener = (event: { tile?: HTMLImageElement; coords?: { x: number; y: number; z: number } }) => void;
const native = vi.hoisted(() => {
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  class Events {
    listeners = new Map<string, Set<Listener>>();
    on(names: string, listener: Listener) { for (const name of names.split(" ")) { const listeners = this.listeners.get(name) ?? new Set(); listeners.add(listener); this.listeners.set(name, listeners); } return this; }
    off(names: string, listener: Listener) { for (const name of names.split(" ")) this.listeners.get(name)?.delete(listener); return this; }
    emit(name: string, event = {}) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
    listenerCount() { return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
  }
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() });
  class NativeMap extends Events {
    dragging = handler(); scrollWheelZoom = handler(); doubleClickZoom = handler(); touchZoom = handler(); tapHold = handler();
    center: { lat: number; lng: number }; zoom: number;
    remove = vi.fn(); stop = vi.fn(); invalidateSize = vi.fn();
    setView = vi.fn((center: [number, number], zoom: number) => { this.center = { lat: center[0], lng: center[1] }; this.zoom = zoom; this.emit("move"); this.emit("zoom"); return this; });
    panBy = vi.fn(() => { this.center.lng += 0.1; this.emit("move"); return this; });
    fitBounds = vi.fn((points: [number, number][]) => { this.center = { lat: points[0][0], lng: points[0][1] }; this.zoom = 4; this.emit("move"); this.emit("zoom"); return this; });
    constructor(public element: HTMLElement, public options: { center: [number, number]; zoom: number }) { super(); this.center = { lat: options.center[0], lng: options.center[1] }; this.zoom = options.zoom; }
    getCenter() { return this.center; } getZoom() { return this.zoom; } getSize() { return { x: 600, y: 400 }; }
  }
  class NativeTiles extends Events {
    loading = false;
    remove = vi.fn();
    addTo = vi.fn(() => this);
    constructor(public url: string, public options: Record<string, unknown>) { super(); }
    isLoading() { return this.loading; }
    getTileUrl(_coords: { x: number; y: number; z: number }): string { return this.url; }
  }
  const maps: NativeMap[] = [], layers: NativeTiles[] = [];
  const create = vi.fn((element: HTMLElement, options: { center: [number, number]; zoom: number }) => { const map = new NativeMap(element, options); maps.push(map); return map; });
  class TileLayer extends NativeTiles { constructor(url: string, options: Record<string, unknown>) { super(url, options); layers.push(this); } }
  return { deferred, release, factory: vi.fn(), create, maps, layers, TileLayer, failCreation: false };
});
vi.mock("leaflet", async () => {
  native.factory(); await native.deferred;
  return { map: (...args: Parameters<typeof native.create>) => { if (native.failCreation) throw new Error("Native initialization failed"); return native.create(...args); }, TileLayer: native.TileLayer };
});

let dimensions = { width: 600, height: 400 };
let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();
const observers: { notify: () => void; disconnect: ReturnType<typeof vi.fn>; observe: ReturnType<typeof vi.fn> }[] = [];
const initial: MapViewport = { center: { lat: 42.3, lng: -71.1 }, zoom: 12 };
const box = (width: number, height: number, left = 0, top = 0) => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON() {} });
async function flushFrames() { await act(async () => { const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(1); }); }
async function start() {
  const ref = createRef<InteractiveMapSurfaceHandle>(); const changed = vi.fn(), status = vi.fn();
  const result = render(<InteractiveMapSurface ref={ref} initialViewport={initial} enabled onViewportChange={changed} onStatusChange={status} />);
  await waitFor(() => expect(native.maps).toHaveLength(1)); await flushFrames();
  return { ...result, ref, changed, status, map: native.maps[0], layer: native.layers[0] };
}
function tile(element: HTMLElement, layer: (typeof native.layers)[number], zoom: number, decoded: boolean, left = 0) {
  const image = document.createElement("img"); image.className = "leaflet-tile";
  image.src = `https://tile.openstreetmap.de/${zoom}/1/1.png`;
  Object.defineProperties(image, { complete: { configurable: true, value: decoded }, naturalWidth: { configurable: true, value: decoded ? 256 : 0 }, naturalHeight: { configurable: true, value: decoded ? 256 : 0 } });
  image.getBoundingClientRect = () => box(256, 256, left);
  element.append(image); layer.emit("tileloadstart", { tile: image, coords: { x: 1, y: 1, z: zoom } });
  return image;
}
beforeEach(() => {
  native.maps.length = 0; native.layers.length = 0; native.create.mockClear(); native.failCreation = false;
  dimensions = { width: 600, height: 400 }; frames = new Map(); observers.length = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => box(dimensions.width, dimensions.height));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class { disconnect = vi.fn(); observe = vi.fn(); constructor(callback: () => void) { observers.push({ notify: callback, disconnect: this.disconnect, observe: this.observe }); } });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.sequential("native map lifecycle", () => {
  it("does not load the browser engine while disabled or zero-sized", async () => {
    const changed = vi.fn();
    const result = render(<InteractiveMapSurface initialViewport={initial} enabled={false} onViewportChange={changed} />);
    expect(native.factory).not.toHaveBeenCalled(); expect(native.create).not.toHaveBeenCalled();
    dimensions = { width: 0, height: 0 };
    result.rerender(<InteractiveMapSurface initialViewport={initial} enabled onViewportChange={changed} />);
    observers[0].notify(); await flushFrames();
    expect(native.factory).not.toHaveBeenCalled(); expect(native.create).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });

  it("ignores the unmounted lazy load and uses the surviving latest viewport and callbacks", async () => {
    const obsolete = vi.fn(); const old = render(<InteractiveMapSurface initialViewport={initial} enabled onViewportChange={obsolete} />);
    await waitFor(() => expect(native.factory).toHaveBeenCalledTimes(1)); old.unmount();
    const first = vi.fn(), latest = vi.fn(), status = vi.fn(); const ref = createRef<InteractiveMapSurfaceHandle>();
    const current = render(<InteractiveMapSurface ref={ref} initialViewport={initial} enabled onViewportChange={first} onStatusChange={status} />);
    const next = { center: { lat: 34.1, lng: -118.2 }, zoom: 10 };
    current.rerender(<InteractiveMapSurface ref={ref} initialViewport={next} enabled onViewportChange={latest} onStatusChange={status} />);
    expect(ref.current?.getViewport()).toBeNull();
    await act(async () => { native.release(); });
    await waitFor(() => expect(native.maps).toHaveLength(1)); await flushFrames();
    expect(native.maps[0].options).toMatchObject({ center: [34.1, -118.2], zoom: 10 });
    expect(latest).toHaveBeenCalledWith(next); expect(first).not.toHaveBeenCalled(); expect(obsolete).not.toHaveBeenCalled();
    expect(status.mock.calls.flat()).not.toContain("ready");
  });

  it("keeps the same native instance, viewport and callbacks across hide and positive resize", async () => {
    const current = await start(); const latest = vi.fn();
    act(() => current.ref.current?.setView({ center: { lat: 40, lng: -74 }, zoom: 9 })); await flushFrames();
    current.rerender(<InteractiveMapSurface ref={current.ref} initialViewport={initial} enabled={false} onViewportChange={latest} />);
    expect(current.map.dragging.disable).toHaveBeenCalled(); expect(current.map.touchZoom.disable).toHaveBeenCalled();
    expect(current.map.remove).not.toHaveBeenCalled();
    const resizeCount = current.map.invalidateSize.mock.calls.length; dimensions = { width: 0, height: 0 };
    observers[0].notify(); await flushFrames(); expect(current.map.invalidateSize).toHaveBeenCalledTimes(resizeCount);
    current.rerender(<InteractiveMapSurface ref={current.ref} initialViewport={initial} enabled onViewportChange={latest} />);
    dimensions = { width: 600, height: 400 }; observers[0].notify(); await flushFrames(); await flushFrames();
    expect(current.map.invalidateSize).toHaveBeenLastCalledWith({ pan: false, animate: false, debounceMoveend: true });
    expect(current.map.dragging.enable).toHaveBeenCalled(); expect(native.create).toHaveBeenCalledTimes(1);
    expect(current.ref.current?.getViewport()).toEqual({ center: { lat: 40, lng: -74 }, zoom: 9 });
    expect(latest).toHaveBeenCalledWith({ center: { lat: 40, lng: -74 }, zoom: 9 });
  });

  it("queues safe hidden commands, bounds fit padding and retains fractional native gesture zoom", async () => {
    const current = await start();
    current.rerender(<InteractiveMapSurface ref={current.ref} initialViewport={initial} enabled={false} onViewportChange={current.changed} />);
    act(() => current.ref.current?.setView({ center: { lat: 100, lng: 300 }, zoom: 25 }));
    expect(current.map.setView).not.toHaveBeenCalled();
    current.rerender(<InteractiveMapSurface ref={current.ref} initialViewport={initial} enabled onViewportChange={current.changed} />);
    expect(current.map.setView).toHaveBeenLastCalledWith([85.0511287798, 180], 18, { animate: false });
    const commands = current.map.setView.mock.calls.length;
    act(() => { current.ref.current?.setView({ center: { lat: NaN, lng: 0 }, zoom: 8 }); current.ref.current?.panBy([Infinity, 0]); current.ref.current?.fitBounds([{ lat: NaN, lng: 0 }]); });
    expect(current.map.setView).toHaveBeenCalledTimes(commands); expect(current.map.panBy).not.toHaveBeenCalled(); expect(current.map.fitBounds).not.toHaveBeenCalled();
    act(() => current.ref.current?.panBy([80, 0])); expect(current.map.panBy).toHaveBeenLastCalledWith([80, 0], { animate: false });
    act(() => current.ref.current?.fitBounds([{ lat: 42, lng: -71 }], { topLeft: [20, 30], bottomRight: [40, 90] }));
    expect(current.map.fitBounds).toHaveBeenLastCalledWith([[42, -71]], { maxZoom: 14, animate: false, paddingTopLeft: [20, 30], paddingBottomRight: [40, 90] });
    act(() => current.ref.current?.fitBounds([{ lat: 40, lng: -74 }, { lat: 42, lng: -71 }], { topLeft: [Infinity, -20], bottomRight: [99999, 99999] }));
    expect(current.map.fitBounds).toHaveBeenLastCalledWith([[40, -74], [42, -71]], { maxZoom: 14, animate: false, paddingTopLeft: [0, 0], paddingBottomRight: [270, 180] });
    await flushFrames(); current.changed.mockClear();
    current.map.zoom = 8.625; current.map.emit("move"); current.map.emit("zoom"); current.map.emit("resize");
    expect(frames.size).toBe(1); await flushFrames();
    expect(current.changed).toHaveBeenCalledTimes(1); expect(current.changed).toHaveBeenLastCalledWith({ center: { lat: 40, lng: -74 }, zoom: 8.625 });
  });

  it("uses bounded native gestures and respects reduced motion without competing keyboard or controls", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const current = await start();
    expect(current.map.options).toMatchObject({ minZoom: 2, maxZoom: 18, keyboard: false, zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true, inertia: false, inertiaMaxSpeed: 1000, zoomAnimation: false, fadeAnimation: false });
    expect(current.layer.options).toMatchObject({ noWrap: true, detectRetina: false, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false });
    expect(current.layer.getTileUrl({ x: 1, y: 2, z: 3 })).toBe("https://tile.openstreetmap.de/3/1/2.png");
    expect(() => current.layer.getTileUrl({ x: -1, y: 2, z: 3 })).toThrow();
    expect(current.container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(current.container.querySelector("button,a")).toBeNull();
  });

  it("reports every active visible tile error and does not hide one behind a decoded neighbor", async () => {
    const current = await start(); const element = current.map.element;
    tile(element, current.layer, 12, true); const broken = tile(element, current.layer, 12, false, 250);
    current.layer.loading = true; current.layer.emit("tileerror", { tile: broken, coords: { x: 1, y: 1, z: 12 } }); await flushFrames();
    expect(current.status.mock.calls.flat()).not.toContain("error");
    current.layer.loading = false; current.layer.emit("load"); await flushFrames(); expect(current.status).toHaveBeenLastCalledWith("error");
    broken.remove(); current.layer.emit("tileunload", { tile: broken, coords: { x: 1, y: 1, z: 12 } }); await flushFrames();
    expect(current.status).toHaveBeenLastCalledWith("ready");
  });

  it("excludes only retired zoom or offscreen errors from active tile health", async () => {
    const current = await start();
    tile(current.map.element, current.layer, 12, true);
    const retired = tile(current.map.element, current.layer, 11, false), outside = tile(current.map.element, current.layer, 12, false, 800);
    current.layer.emit("tileerror", { tile: retired, coords: { x: 1, y: 1, z: 11 } }); current.layer.emit("tileerror", { tile: outside, coords: { x: 1, y: 1, z: 12 } }); await flushFrames();
    expect(current.status).toHaveBeenLastCalledWith("ready"); expect(current.status.mock.calls.flat()).not.toContain("error");
    expect(retired.dataset.pswMapTileZoom).toBe("11");
  });

  it("requires current visible images to decode before reporting ready", async () => {
    const current = await start();
    tile(current.map.element, current.layer, 12, true); const pending = tile(current.map.element, current.layer, 12, false, 250);
    current.layer.emit("load"); await flushFrames(); expect(current.status.mock.calls.flat()).not.toContain("ready");
    Object.defineProperties(pending, { complete: { value: true }, naturalWidth: { value: 256 }, naturalHeight: { value: 256 } });
    current.layer.emit("tileload"); await flushFrames(); expect(current.status).toHaveBeenLastCalledWith("ready");
  });

  it("cleans StrictMode instances, observers, tile listeners and queued work without late callbacks", async () => {
    const changed = vi.fn(); const current = render(<StrictMode><InteractiveMapSurface initialViewport={initial} enabled onViewportChange={changed} /></StrictMode>);
    await waitFor(() => expect(native.maps).toHaveLength(1));
    native.maps[0].emit("move"); observers.at(-1)!.notify(); expect(frames.size).toBeGreaterThan(0);
    current.unmount(); expect(frames.size).toBe(0);
    expect(native.maps[0].remove).toHaveBeenCalledTimes(1); expect(native.layers[0].remove).toHaveBeenCalledTimes(1);
    expect(native.maps[0].listenerCount()).toBe(0); expect(native.layers[0].listenerCount()).toBe(0);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    await flushFrames(); expect(changed).not.toHaveBeenCalled();
  });

  it("reports initialization failure without an automatic retry loop", async () => {
    native.failCreation = true; const status = vi.fn();
    render(<InteractiveMapSurface initialViewport={initial} enabled onViewportChange={vi.fn()} onStatusChange={status} />);
    await waitFor(() => expect(status).toHaveBeenLastCalledWith("error"));
    observers[0].notify(); window.dispatchEvent(new Event("resize")); await flushFrames();
    expect(native.create).not.toHaveBeenCalled(); expect(native.maps).toHaveLength(0);
    expect(status.mock.calls.flat()).toEqual(["loading", "error"]);
  });
});
