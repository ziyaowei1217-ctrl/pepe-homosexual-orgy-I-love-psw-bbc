"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Coords, Map as LeafletMap, TileEvent, TileLayer } from "leaflet";

import { mapTileUrl, type MapPoint } from "@/lib/listing-map";

export type MapViewport = { center: MapPoint; zoom: number };
export type MapSurfaceStatus = "loading" | "ready" | "error";
type MapPadding = { topLeft: [number, number]; bottomRight: [number, number] };

export type InteractiveMapSurfaceHandle = {
  setView: (viewport: MapViewport) => void;
  panBy: (offset: [number, number]) => void;
  getViewport: () => MapViewport | null;
  fitBounds: (points: MapPoint[], padding?: MapPadding) => void;
};

type Props = {
  initialViewport: MapViewport;
  enabled: boolean;
  onViewportChange: (viewport: MapViewport) => void;
  onStatusChange?: (status: MapSurfaceStatus) => void;
};

type Command = { kind: "view"; viewport: MapViewport } | { kind: "fit"; points: MapPoint[]; padding?: MapPadding };
const latitudeLimit = 85.0511287798;
let engineImport: Promise<typeof import("leaflet")> | undefined;
function loadEngine() {
  // Share pending work across StrictMode effect replay and map surfaces. A
  // failed chunk can be attempted again only by an explicit remount/retry.
  engineImport ??= import("leaflet").catch((error) => { engineImport = undefined; throw error; });
  return engineImport;
}
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
function boundedPoint(point: MapPoint): MapPoint | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return { lat: clamp(point.lat, -latitudeLimit, latitudeLimit), lng: clamp(point.lng, -180, 180) };
}
function boundedViewport(viewport: MapViewport): MapViewport | null {
  const center = boundedPoint(viewport.center);
  return center && Number.isFinite(viewport.zoom) ? { center, zoom: clamp(viewport.zoom, 2, 18) } : null;
}

// Leaflet owns only this basemap element. Listing text, links and controls stay
// in React; no provider scripts, popup HTML or location permission are needed.
export const InteractiveMapSurface = forwardRef<InteractiveMapSurfaceHandle, Props>(function InteractiveMapSurface({ initialViewport, enabled, onViewportChange, onStatusChange }, ref) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const initialRef = useRef(initialViewport); initialRef.current = initialViewport;
  const callbacks = useRef({ onViewportChange, onStatusChange }); callbacks.current = { onViewportChange, onStatusChange };
  const commandRef = useRef<Command | null>(null);
  const controllerRef = useRef<{ reconcile: () => void; execute: (command: Command) => void; panBy: (offset: [number, number]) => void } | null>(null);

  useImperativeHandle(ref, () => ({
    setView(viewport) {
      const safe = boundedViewport(viewport);
      if (!safe) return;
      const command: Command = { kind: "view", viewport: safe };
      commandRef.current = command;
      controllerRef.current?.execute(command);
    },
    panBy(offset) {
      if (offset.every(Number.isFinite)) controllerRef.current?.panBy(offset);
    },
    getViewport() {
      const map = mapRef.current;
      if (!map) return null;
      const center = map.getCenter();
      return boundedViewport({ center: { lat: center.lat, lng: center.lng }, zoom: map.getZoom() });
    },
    fitBounds(points, padding) {
      const safe = points.flatMap((point) => { const bounded = boundedPoint(point); return bounded ? [bounded] : []; });
      if (!safe.length) return;
      const command: Command = { kind: "fit", points: safe, padding };
      commandRef.current = command;
      controllerRef.current?.execute(command);
    }
  }), []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let disposed = false, failed = false, importing = false;
    let library: typeof import("leaflet") | undefined;
    let map: LeafletMap | undefined, tiles: TileLayer | undefined;
    let viewportFrame: number | undefined, resizeFrame: number | undefined;
    let checkTiles = false, status: MapSurfaceStatus | undefined;
    const tileErrors = new WeakSet<HTMLImageElement>();
    const visible = () => {
      const box = element.getBoundingClientRect();
      return enabledRef.current && box.width > 0 && box.height > 0;
    };
    const reportStatus = (next: MapSurfaceStatus) => {
      if (disposed || status === next) return;
      status = next; callbacks.current.onStatusChange?.(next);
    };
    const reportViewport = () => {
      if (disposed || !map || !visible()) return;
      const center = map.getCenter();
      const viewport = boundedViewport({ center: { lat: center.lat, lng: center.lng }, zoom: map.getZoom() });
      if (viewport) callbacks.current.onViewportChange(viewport);
    };
    const assessTiles = () => {
      if (!tiles || !map || tiles.isLoading() || !visible()) return;
      const frame = element.getBoundingClientRect();
      const currentTileZoom = Math.round(map.getZoom());
      const images = [...element.querySelectorAll<HTMLImageElement>("img.leaflet-tile")].filter((image) => {
        const box = image.getBoundingClientRect();
        return image.isConnected && Number(image.dataset.pswMapTileZoom) === currentTileZoom && box.width > 0 && box.height > 0 && box.right > frame.left && box.left < frame.right && box.bottom > frame.top && box.top < frame.bottom;
      });
      // A successful neighboring tile must not hide an active grid failure.
      // Retiring grids are identified by native tile coordinates, not CSS load
      // classes: failed/unloaded current tiles remain part of this assessment.
      if (images.some((image) => tileErrors.has(image))) reportStatus("error");
      else if (images.length && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)) reportStatus("ready");
    };
    const scheduleViewport = () => {
      if (disposed || viewportFrame !== undefined) return;
      viewportFrame = requestAnimationFrame(() => {
        viewportFrame = undefined;
        reportViewport();
        if (checkTiles) { checkTiles = false; assessTiles(); }
      });
    };
    const scheduleHealth = () => { checkTiles = true; scheduleViewport(); };
    const startingTile = (event: TileEvent) => {
      if (event.tile instanceof HTMLImageElement) event.tile.dataset.pswMapTileZoom = String(event.coords.z);
    };
    const tileError = (event: TileEvent) => { if (event.tile instanceof HTMLImageElement) tileErrors.add(event.tile); scheduleHealth(); };
    const retiredTile = (event: TileEvent) => { if (event.tile instanceof HTMLImageElement) tileErrors.delete(event.tile); scheduleHealth(); };
    const loadingTiles = () => { if (visible()) reportStatus("loading"); };
    const destroyMap = () => {
      const owned = map; const layer = tiles;
      map = undefined; tiles = undefined;
      if (mapRef.current === owned) mapRef.current = null;
      if (!owned) return;
      owned.off("move zoom resize", scheduleViewport);
      owned.off("moveend zoomend", scheduleHealth);
      try {
        layer?.off("tileerror", tileError);
        layer?.off("tileloadstart", startingTile);
        layer?.off("tileabort", retiredTile);
        layer?.off("tileunload", retiredTile);
        layer?.off("load tileload", scheduleHealth);
        layer?.off("loading", loadingTiles);
        layer?.remove();
      } finally { owned.remove(); }
    };
    const fail = () => {
      failed = true;
      destroyMap();
      reportStatus("error");
    };
    const setInteractions = (active: boolean) => {
      if (!map) return;
      for (const handler of [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom, map.tapHold]) {
        if (active) handler?.enable(); else handler?.disable();
      }
      if (!active) map.stop();
    };
    const apply = (command: Command) => {
      if (!map || !visible()) return;
      map.stop();
      if (command.kind === "view") map.setView([command.viewport.center.lat, command.viewport.center.lng], command.viewport.zoom, { animate: false });
      else {
        const size = map.getSize();
        const padding = (pair?: [number, number]): [number, number] => [
          clamp(Number.isFinite(pair?.[0]) ? pair![0] : 0, 0, size.x * 0.45),
          clamp(Number.isFinite(pair?.[1]) ? pair![1] : 0, 0, size.y * 0.45)
        ];
        map.fitBounds(command.points.map((point) => [point.lat, point.lng] as [number, number]), {
          maxZoom: 14, animate: false,
          paddingTopLeft: padding(command.padding?.topLeft), paddingBottomRight: padding(command.padding?.bottomRight)
        });
      }
      if (commandRef.current === command) commandRef.current = null;
      scheduleViewport();
    };
    const reconcile = () => {
      if (disposed || failed) return;
      if (!visible()) { setInteractions(false); return; }
      if (map) {
        try {
          map.invalidateSize({ pan: false, animate: false, debounceMoveend: true });
          setInteractions(true);
          if (commandRef.current) apply(commandRef.current);
          scheduleHealth();
        } catch { fail(); }
        return;
      }
      if (!library) {
        if (importing) return;
        importing = true; reportStatus("loading");
        void loadEngine().then((module) => {
          if (disposed) return;
          library = module; importing = false; reconcile();
        }).catch(() => { if (!disposed) { importing = false; fail(); } });
        return;
      }
      try {
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const initial = commandRef.current?.kind === "view" ? commandRef.current.viewport : boundedViewport(initialRef.current) ?? { center: { lat: 0, lng: 0 }, zoom: 2 };
        map = library.map(element, {
          center: [initial.center.lat, initial.center.lng], zoom: initial.zoom,
          minZoom: 2, maxZoom: 18, maxBounds: [[-latitudeLimit, -180], [latitudeLimit, 180]], maxBoundsViscosity: 1,
          zoomControl: false, attributionControl: false, keyboard: false, boxZoom: false,
          dragging: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true,
          trackResize: false, inertia: !reducedMotion, inertiaMaxSpeed: 1000, zoomAnimation: false, fadeAnimation: false,
          bounceAtZoomLimits: false, wheelDebounceTime: 80
        });
        mapRef.current = map;
        class ApprovedTiles extends library.TileLayer {
          getTileUrl(coords: Coords) { return mapTileUrl(coords.x, coords.y, coords.z); }
        }
        tiles = new ApprovedTiles("", { minZoom: 2, maxZoom: 18, noWrap: true, bounds: [[-latitudeLimit, -180], [latitudeLimit, 180]],
          updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0, detectRetina: false });
        map.on("move zoom resize", scheduleViewport);
        map.on("moveend zoomend", scheduleHealth);
        tiles.on("tileerror", tileError);
        tiles.on("tileloadstart", startingTile);
        tiles.on("tileabort", retiredTile);
        tiles.on("tileunload", retiredTile);
        tiles.on("load tileload", scheduleHealth);
        tiles.on("loading", loadingTiles);
        tiles.addTo(map);
        if (commandRef.current) apply(commandRef.current);
        scheduleHealth();
      } catch { fail(); }
    };
    const scheduleResize = () => {
      if (disposed || resizeFrame !== undefined) return;
      resizeFrame = requestAnimationFrame(() => { resizeFrame = undefined; reconcile(); });
    };
    const controller = {
      reconcile,
      execute(command: Command) { if (!disposed && !failed) { try { apply(command); } catch { fail(); } } },
      panBy(offset: [number, number]) {
        if (!disposed && !failed && map && visible()) {
          try { map.stop(); map.panBy(offset, { animate: false }); scheduleViewport(); } catch { fail(); }
        }
      }
    };
    controllerRef.current = controller;
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(scheduleResize);
    observer?.observe(element);
    window.addEventListener("resize", scheduleResize);
    reconcile();
    return () => {
      disposed = true;
      observer?.disconnect(); window.removeEventListener("resize", scheduleResize);
      if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame);
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      if (controllerRef.current === controller) controllerRef.current = null;
      destroyMap();
    };
  }, []);

  useEffect(() => { controllerRef.current?.reconcile(); }, [enabled]);

  return <div ref={elementRef} className="psw-map-surface absolute inset-0 z-0" aria-hidden="true" />;
});
