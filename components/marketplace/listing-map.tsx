"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Building2, LocateFixed, Minus, Plus, X } from "lucide-react";
import type { Map as MapLibreMap, MapMouseEvent, MapOptions, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Supercluster from "supercluster";

import { ListingCard } from "@/components/marketplace/listing-card";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { getListingBounds, getListingPoint, getMapStyle, type MapBounds, type MapPoint } from "@/lib/listing-map";
import { listingHref } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { formatUsd, stayPrice } from "@/lib/stay-price";
import { cn } from "@/lib/utils";

type MapLibre = typeof import("maplibre-gl");

const mapLocale = {
  "AttributionControl.ToggleAttribution": "显示或隐藏地图来源",
  "CooperativeGesturesHandler.WindowsHelpText": "按住 Ctrl 再滚动来缩放地图",
  "CooperativeGesturesHandler.MacHelpText": "按住 ⌘ 再滚动来缩放地图",
  "CooperativeGesturesHandler.MobileHelpText": "用两根手指移动地图"
};
// Room for the search-area toggle above and the view switcher below, so fitted pins are never under them.
const fitPadding = { top: 88, bottom: 104, left: 56, right: 72 };
const clusterMaxZoom = 14;

/**
 * Loads MapLibre after the page has rendered and creates one map in `container`; `map` is null until it is ready.
 * `options` are read once, when the map is created.
 */
export function useMapLibre(container: RefObject<HTMLElement | null>, options: Pick<MapOptions, "center" | "zoom" | "bounds" | "cooperativeGestures">) {
  const [state, setState] = useState<{ map: MapLibreMap; maplibre: MapLibre } | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = useRef(options);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      map = new maplibre.Map({
        container: container.current,
        style: getMapStyle(),
        ...initial.current,
        fitBoundsOptions: { padding: fitPadding, maxZoom: clusterMaxZoom },
        minZoom: 2,
        maxZoom: 18,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        locale: mapLocale
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      // A missing basemap leaves the pins usable, so say so instead of failing the page.
      let styleLoaded = false;
      map.once("style.load", () => { styleLoaded = true; });
      map.on("error", () => { if (!styleLoaded) setFailed(true); });
      setState({ map, maplibre });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; map?.remove(); };
  }, [container]);

  useEffect(() => {
    const element = container.current;
    if (!state || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => state.map.resize({ fromCode: true }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, state]);

  return { map: state?.map ?? null, maplibre: state?.maplibre ?? null, failed };
}

function MapZoomControls({ map, onFit, fitLabel }: { map: MapLibreMap | null; onFit?: () => void; fitLabel?: string }) {
  return <div className="absolute right-4 top-4 z-20 flex flex-col gap-3">
    {onFit ? <button type="button" aria-label={fitLabel} title={fitLabel} onClick={onFit} className="grid size-11 place-items-center rounded-full bg-surface shadow-menu hover:bg-surface-subtle"><LocateFixed className="size-5" /></button> : null}
    <div className="overflow-hidden rounded-full bg-surface shadow-menu">
      <button type="button" aria-label="放大地图" disabled={!map} onClick={() => map?.zoomIn()} className="grid size-11 place-items-center border-b border-line-strong hover:bg-surface-subtle disabled:opacity-30"><Plus className="size-4" /></button>
      <button type="button" aria-label="缩小地图" disabled={!map} onClick={() => map?.zoomOut()} className="grid size-11 place-items-center hover:bg-surface-subtle disabled:opacity-30"><Minus className="size-4" /></button>
    </div>
  </div>;
}

function MapNotice({ failed }: { failed: boolean }) {
  return failed ? <p role="status" className="absolute bottom-3 left-3 z-20 rounded-full bg-surface px-3 py-1.5 text-m-footnote text-ink-secondary shadow-menu">底图没有加载出来，房源位置仍可查看</p> : null;
}

type PinProperties = { id: string; label: string; title: string };

/**
 * Interactive listing map for search and saved listings: price pins that merge into counts when crowded, a card for the
 * selected listing, and (with `searchArea`) results that follow the map as it moves.
 */
export function ListingMap({ listings, fitKey, bounds = null, moveIn = "", moveOut = "", highlightedId, selectedId, onSelect, onOpen, onToggleSave, searchArea, controls, className, label }: {
  listings: PreviewListing[];
  /** When this changes and no map area is set, the map refits to `listings`. */
  fitKey?: string;
  /** The map area the results are limited to; the map opens on it. */
  bounds?: MapBounds | null;
  moveIn?: string; moveOut?: string;
  highlightedId?: string | null; selectedId: string;
  onSelect: (id: string) => void; onOpen?: (id: string) => void; onToggleSave?: (listing: PreviewListing) => void;
  searchArea?: { onSearch: (bounds: MapBounds) => void; onClear: () => void };
  /** Shown at the bottom centre of the map on large screens (the search page's view switch). */
  controls?: ReactNode;
  className?: string; label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  // Only the first render decides where the map opens; later changes move it with fitBounds.
  const opening = bounds ?? getListingBounds(listings);
  const { map, maplibre, failed } = useMapLibre(container, opening ? { bounds: opening } : { center: [-118.2437, 34.0522], zoom: 10 });
  const { savedIds, toggleSaved } = useSavedListings();
  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => new Set());
  const [followMap, setFollowMap] = useState(true);
  const [moved, setMoved] = useState(false);
  const [compact, setCompact] = useState(false);
  const [popupNode, setPopupNode] = useState<HTMLDivElement | null>(null);
  const markers = useRef<PinMarkers>(new Map());
  const latest = useRef({ onSelect, searchArea, followMap });
  latest.current = { onSelect, searchArea, followMap };
  const pinState = useRef<PinState>({ highlightedId, selectedId, savedIds, viewed });
  pinState.current = { highlightedId, selectedId, savedIds, viewed };
  const selected = listings.find((listing) => listing.id === selectedId);

  // Keyed by content, so results that only follow the map (same pins, new array) keep their markers.
  const pinsJson = JSON.stringify(listings.map((listing) => {
    const point = getListingPoint(listing);
    const total = moveIn && moveOut ? stayPrice(listing.price, moveIn, moveOut)?.total : undefined;
    return { type: "Feature", geometry: { type: "Point", coordinates: [point.lng, point.lat] }, properties: { id: listing.id, label: formatUsd(total ?? listing.price), title: listing.title } };
  }));
  const index = useMemo(() => new Supercluster<PinProperties>({ radius: 64, maxZoom: clusterMaxZoom }).load(JSON.parse(pinsJson)), [pinsJson]);

  // Pins are plain DOM markers kept in sync with the clusters in view, so panning never re-renders React.
  useEffect(() => {
    if (!map || !maplibre) return;
    const current = markers.current;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const view = map.getBounds();
      const features = index.getClusters([view.getWest(), view.getSouth(), view.getEast(), view.getNorth()], Math.round(map.getZoom()));
      const keep = new Set<string>();
      for (const feature of features) {
        const [lng, lat] = feature.geometry.coordinates;
        const cluster = "cluster" in feature.properties ? feature.properties : null;
        const key = cluster ? `cluster-${cluster.cluster_id}` : feature.properties.id;
        keep.add(key);
        if (current.has(key)) continue;
        const element = document.createElement("button");
        element.type = "button";
        if (cluster) {
          const ids = index.getLeaves(cluster.cluster_id, Infinity).map((leaf) => leaf.properties.id);
          element.className = "map-cluster";
          element.textContent = String(cluster.point_count);
          element.setAttribute("aria-label", `放大查看这里的 ${cluster.point_count} 套房源`);
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            map.easeTo({ center: [lng, lat], zoom: Math.min(index.getClusterExpansionZoom(cluster.cluster_id), clusterMaxZoom + 1) });
          });
          current.set(key, { marker: new maplibre.Marker({ element }).setLngLat([lng, lat]).addTo(map), element, ids });
        } else {
          const { id, label, title } = feature.properties as PinProperties;
          element.className = "map-pin";
          element.textContent = label;
          element.setAttribute("aria-label", `${title} ${label}`);
          element.addEventListener("click", (event) => { event.stopPropagation(); latest.current.onSelect(id); });
          current.set(key, { marker: new maplibre.Marker({ element }).setLngLat([lng, lat]).addTo(map), element, ids: [id] });
        }
      }
      for (const [key, entry] of current) if (!keep.has(key)) { entry.marker.remove(); current.delete(key); }
      paintPins(current, pinState.current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    draw();
    map.on("move", schedule);
    return () => {
      map.off("move", schedule);
      cancelAnimationFrame(frame);
      for (const entry of current.values()) entry.marker.remove();
      current.clear();
    };
  }, [map, maplibre, index]);

  useEffect(() => paintPins(markers.current, pinState.current), [highlightedId, selectedId, savedIds, viewed]);

  useEffect(() => {
    if (selectedId) setViewed((current) => current.has(selectedId) ? current : new Set(current).add(selectedId));
  }, [selectedId]);

  // Refit when the search itself changes (place, dates, filters), not when the results follow the map.
  const fittedKey = useRef(fitKey);
  useEffect(() => {
    if (!map || fittedKey.current === fitKey) return;
    fittedKey.current = fitKey;
    if (!bounds) fitToListings(map, listings);
  }, [map, fitKey, bounds, listings]);

  // Moving the map by hand either updates the results right away or offers 搜索此区域.
  // Moves made by this file (fitting results, resizing, showing a card) carry `fromCode` and change nothing.
  useEffect(() => {
    if (!map) return;
    const onMoveEnd = (event: { fromCode?: boolean }) => {
      const area = latest.current.searchArea;
      if (event.fromCode || !area) return;
      if (latest.current.followMap) area.onSearch(mapBounds(map));
      else setMoved(true);
    };
    // Clicks on pins and on the open card bubble up to the map; only a click on the map itself closes the card.
    const onClick = (event: MapMouseEvent) => {
      if (!(event.originalEvent.target as Element).closest(".map-pin, .map-cluster, .maplibregl-popup")) latest.current.onSelect("");
    };
    map.on("moveend", onMoveEnd);
    map.on("click", onClick);
    return () => { map.off("moveend", onMoveEnd); map.off("click", onClick); };
  }, [map]);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 640));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // On wider maps the card opens next to its pin and flips to whichever side has room, like a popover.
  useEffect(() => {
    if (!map || !maplibre || !selected || compact) return;
    const point = getListingPoint(selected);
    const node = document.createElement("div");
    const popup = new maplibre.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, maxWidth: "none", offset: 22, className: "map-card-popup" })
      .setLngLat([point.lng, point.lat]).setDOMContent(node).addTo(map);
    setPopupNode(node);
    if (!map.getBounds().contains([point.lng, point.lat])) map.easeTo({ center: [point.lng, point.lat] }, { fromCode: true });
    return () => { popup.remove(); setPopupNode(null); };
  }, [map, maplibre, selected, compact]);

  const card = selected ? <div className="relative w-[300px] max-w-full">
    <button type="button" aria-label="关闭房源卡片" onClick={() => onSelect("")} className="absolute left-4 top-4 z-20 grid size-9 place-items-center rounded-full bg-photo-button text-ink shadow-menu hover:scale-105"><X className="size-4" /></button>
    <ListingCard
      listing={selected}
      href={listingHref(selected.id, { moveIn, moveOut })}
      moveIn={moveIn}
      moveOut={moveOut}
      sizes="300px"
      className="shadow-dialog hover:translate-y-0"
      saved={savedIds.has(selected.id)}
      onToggleSave={() => onToggleSave ? onToggleSave(selected) : toggleSaved(selected.id)}
      onOpen={() => onOpen?.(selected.id)}
    />
  </div> : null;

  return <section aria-label={label} className={cn("listing-map relative overflow-hidden bg-line-strong", className)} onKeyDown={(event) => { if (event.key === "Escape" && selectedId) onSelect(""); }}>
    {/* !absolute: MapLibre marks its container position: relative. */}
    <div ref={container} className="!absolute inset-0" />
    {searchArea ? <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
      {moved && !followMap
        ? <button type="button" onClick={() => { if (map) searchArea.onSearch(mapBounds(map)); setMoved(false); }} className="min-h-11 whitespace-nowrap rounded-full bg-ink-block px-5 font-rounded text-d-subhead font-bold text-on-dark shadow-menu hover:bg-ink">搜索此区域</button>
        : <label className="flex min-h-11 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-full bg-surface px-4 text-d-subhead font-semibold text-ink shadow-menu"><input type="checkbox" checked={followMap} onChange={(event) => { setFollowMap(event.target.checked); setMoved(false); }} className="size-[18px] accent-primary" />移动地图时更新结果</label>}
    </div> : null}
    <MapZoomControls map={map} fitLabel="显示全部结果" onFit={() => { searchArea?.onClear(); setMoved(false); if (map) fitToListings(map, listings); }} />
    {!listings.length ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6 text-center"><p className="rounded-full bg-surface px-4 py-2 text-d-subhead text-ink-secondary shadow-menu">当前条件下没有房源，调整筛选后再看看。</p></div> : null}
    {popupNode && card ? createPortal(card, popupNode) : null}
    {/* Narrow maps: the card sits above the phone tab bar and the view switcher. */}
    {compact && card ? <div className="fixed inset-x-0 bottom-[148px] z-30 flex justify-center px-4 md:bottom-[92px]">{card}</div> : null}
    {controls ? <div className="absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 lg:block">{controls}</div> : null}
    <MapNotice failed={failed} />
  </section>;
}

type PinMarkers = Map<string, { marker: Marker; element: HTMLButtonElement; ids: string[] }>;
type PinState = { highlightedId?: string | null; selectedId: string; savedIds: ReadonlySet<string>; viewed: ReadonlySet<string> };

/** Pin states: the card hovered in the list or the open card (dark), saved (heart), already opened (grey). */
function paintPins(markers: PinMarkers, { highlightedId, selectedId, savedIds, viewed }: PinState) {
  for (const { element, ids } of markers.values()) {
    const active = ids.some((id) => id === highlightedId || id === selectedId);
    element.classList.toggle("is-active", active);
    element.classList.toggle("is-saved", ids.length === 1 && savedIds.has(ids[0]));
    element.classList.toggle("is-viewed", ids.length === 1 && viewed.has(ids[0]) && !active);
    if (ids.length === 1) element.setAttribute("aria-pressed", String(ids[0] === selectedId));
    element.style.zIndex = active ? "3" : "";
  }
}

function fitToListings(map: MapLibreMap, listings: PreviewListing[]) {
  const target = getListingBounds(listings);
  if (target) map.fitBounds(target, { padding: fitPadding, maxZoom: clusterMaxZoom, duration: 600 }, { fromCode: true });
}

function mapBounds(map: MapLibreMap): MapBounds {
  const view = map.getBounds();
  return [view.getWest(), view.getSouth(), view.getEast(), view.getNorth()];
}

/** The listing page's map: an approximate area around the listing, zoomable, without taking over page scrolling. */
export function ListingLocationMap({ point, area }: { point: MapPoint; area: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { map, maplibre, failed } = useMapLibre(container, { center: [point.lng, point.lat], zoom: 14, cooperativeGestures: true });
  const [markerNode, setMarkerNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map || !maplibre) return;
    const element = document.createElement("div");
    element.className = "map-area-marker";
    const marker = new maplibre.Marker({ element }).setLngLat([point.lng, point.lat]).addTo(map);
    setMarkerNode(element);
    return () => { marker.remove(); setMarkerNode(null); };
  }, [map, maplibre, point.lat, point.lng]);

  return <div className="listing-map relative mt-5 h-[340px] overflow-hidden rounded-psw-xl bg-line-strong" role="region" aria-label="房源位置地图">
    {/* !absolute: MapLibre marks its container position: relative. */}
    <div ref={container} className="!absolute inset-0" />
    {markerNode ? createPortal(<span className="grid size-14 place-items-center rounded-full border-4 border-surface bg-primary text-on-primary shadow-menu"><Building2 className="size-6" aria-hidden="true" /></span>, markerNode) : null}
    <MapZoomControls map={map} />
    <div className="absolute bottom-4 left-4 z-10 rounded-psw-lg bg-surface p-4 shadow-menu"><p className="text-d-label text-ink">{area}</p><p className="mt-1 text-m-footnote text-ink-secondary">地图显示大致位置，准确地址将在申请流程中按规则展示</p></div>
    <MapNotice failed={failed} />
  </div>;
}
