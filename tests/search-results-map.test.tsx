// @vitest-environment jsdom
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchResultsMap } from "../components/marketplace/search-results-map";
import { createPreviewListings } from "../lib/preview-data";
import { mapCampusLandmarks } from "../lib/map-campus-landmarks";
const engine = vi.hoisted(() => ({ setView: vi.fn(), fitBounds: vi.fn(), panBy: vi.fn(), mounts: 0, center: { lat: 34.05, lng: -118.4 }, zoom: 11 }));
vi.mock("../components/marketplace/interactive-map-surface", () => ({ InteractiveMapSurface: forwardRef(function Surface({ onViewportChange, onStatusChange }: { onViewportChange: (v: unknown) => void; onStatusChange: (s: string) => void }, ref) {
  useImperativeHandle(ref, () => ({ setView: engine.setView, fitBounds: engine.fitBounds, panBy: engine.panBy, getViewport: () => ({ center: engine.center, zoom: engine.zoom }) }), []);
  useEffect(() => { engine.mounts++; onViewportChange({ center: engine.center, zoom: engine.zoom }); onStatusChange("ready"); }, [onViewportChange, onStatusChange]);
  return <div data-testid="native-map" />;
}) }));
const listings = createPreviewListings().slice(0, 24);
const props = { listings, view: "map" as const, page: 1, pageCount: 2, onSelect: vi.fn(), onOpen: vi.fn(), onClose: vi.fn(), onPageChange: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); engine.mounts = 0; vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; }); vi.stubGlobal("cancelAnimationFrame", vi.fn()); vi.stubGlobal("scrollTo", vi.fn()); vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false }))); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("student sublease map interactions", () => {
  it("fits once, preserves the engine and manual camera across list/map switches", () => {
    const page = render(<SearchResultsMap {...props} />);
    expect(engine.fitBounds).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "放大地图" }));
    expect(engine.setView).toHaveBeenLastCalledWith({ center: engine.center, zoom: 12 });
    page.rerender(<SearchResultsMap {...props} view="list" />);
    page.rerender(<SearchResultsMap {...props} view="map" />);
    expect(engine.mounts).toBe(1);
    expect(engine.fitBounds).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "显示本页全部房源" }));
    expect(engine.fitBounds).toHaveBeenCalledTimes(2);
  });
  it("keeps date-bearing preview navigation and closes with Escape without hijacking button arrow keys", () => {
    render(<SearchResultsMap {...props} activeListing={listings[0]} selectedListingId={listings[0].id} stay={{ moveIn: "2026-10-10", moveOut: "2026-11-10" }} />);
    const link = screen.getByRole("link", { name: /查看房源/ });
    expect(link.getAttribute("href")).toContain("moveIn=2026-10-10&moveOut=2026-11-10");
    expect(screen.getByText(`租期 ${listings[0].availableFrom} — ${listings[0].availableTo}`)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "放大地图" }), { key: "ArrowRight" });
    expect(engine.panBy).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("region", { name: "房源地图" }), { key: "ArrowRight" });
    expect(engine.panBy).toHaveBeenCalledWith([80, 0]);
    fireEvent.keyDown(link, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it("moves keyboard focus from a removed cluster row to its matching preview and back to the opener", () => {
    const samePlace = listings.slice(0, 2).map((listing) => ({ ...listing, latitude: engine.center.lat, longitude: engine.center.lng }));
    function Controlled() {
      const [selected, setSelected] = useState("");
      return <SearchResultsMap {...props} listings={samePlace} selectedListingId={selected} activeListing={samePlace.find((listing) => listing.id === selected)} onSelect={setSelected} onClose={() => setSelected("")} />;
    }
    render(<Controlled />);
    const opener = screen.getByRole("button", { name: "查看此区域 2 套房源" });
    fireEvent.click(opener);
    const row = screen.getByRole("button", { name: new RegExp(samePlace[0].title) });
    row.focus(); fireEvent.click(row);
    const preview = screen.getByRole("link", { name: /查看房源/ });
    expect(document.activeElement).toBe(preview);
    // The selected price and its neighbours share one honest geographic pin.
    expect(opener.isConnected).toBe(true);
    expect(opener.textContent).toContain(`$${samePlace[0].price.toLocaleString()}`);
    expect(opener.textContent).toContain("/月");
    expect(screen.getAllByRole("button", { name: /此区域.*套房源/ })).toHaveLength(1);
    fireEvent.keyDown(preview, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: new RegExp(samePlace[1].title) })).toBeTruthy();
  });

  it("keeps the selected rent pill above the actual preview on a 104px landscape canvas", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const card = this.classList.contains("search-map-preview");
      return { x: 0, y: card ? 196 : 144, top: card ? 196 : 144, bottom: card ? 248 : 248, left: 0, right: 568, width: 568, height: card ? 52 : 104, toJSON() {} } as DOMRect;
    });
    // Native callbacks may precede ResizeObserver; actual measured geometry
    // must win over the component's initial 720x640 placeholder.
    const listing = { ...listings[0], latitude: engine.center.lat, longitude: engine.center.lng };
    render(<SearchResultsMap {...props} listings={[listing]} activeListing={listing} selectedListingId={listing.id} />);
    expect(engine.setView).toHaveBeenLastCalledWith({ center: engine.center, zoom: 12 });
    expect(engine.panBy).toHaveBeenLastCalledWith([0, 26]);
  });

  it("reveals a wide selected pin whose edge overlaps a phone control despite its centre being clear", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const frame = this.classList.contains("search-map");
      const pin = this.classList.contains("search-map-price");
      const rail = this.classList.contains("search-map-zoom");
      const card = this.classList.contains("search-map-preview");
      const width = frame || card ? 320 : pin ? 128.8 : rail ? 44 : 0;
      const height = frame ? 529 : card ? 156 : pin ? 48.4 : rail ? 144 : 0;
      const left = rail ? 259 : 0, top = rail ? 293 : card ? 550 : 211;
      return { x: left, y: top, top, bottom: top + height, left, right: left + width, width, height, toJSON() {} } as DOMRect;
    });
    const listing = { ...listings[0], latitude: engine.center.lat + .048, longitude: engine.center.lng + .03 };
    render(<SearchResultsMap {...props} listings={[listing]} activeListing={listing} selectedListingId={listing.id} />);
    expect(engine.setView).toHaveBeenLastCalledWith({ center: { lat: listing.latitude, lng: listing.longitude }, zoom: 12 });
  });

  it("city focus changes only the camera and retains every current-page listing", () => {
    const mixed = [listings[0], { ...listings[1], area: "Boston · Back Bay" }];
    render(<SearchResultsMap {...props} listings={mixed} />);
    fireEvent.change(screen.getByRole("combobox", { name: "聚焦地图城市" }), { target: { value: "Boston" } });
    expect(engine.fitBounds.mock.calls.at(-1)?.[0]).toHaveLength(1);
    expect(screen.getByText(/本页 2/)).toBeTruthy();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onPageChange).not.toHaveBeenCalled();
  });

  it("campus references move only the camera and can be chosen again after a manual pan", () => {
    const mixed = [listings[0], { ...listings[1], area: "Boston · Back Bay" }];
    render(<SearchResultsMap {...props} listings={mixed} stay={{ moveIn: "2026-10-10", moveOut: "2026-11-10" }} />);
    const picker = screen.getByRole("combobox", { name: "定位校园参照点" });
    const mit = mapCampusLandmarks.find((campus) => campus.id === "mit")!;
    expect(screen.getAllByRole("option", { name: /^(UCLA|MIT)$/ })).toHaveLength(2);
    fireEvent.change(picker, { target: { value: mit.id } });
    expect(engine.setView).toHaveBeenLastCalledWith({ center: { lat: mit.lat, lng: mit.lng }, zoom: 14 });
    expect((picker as HTMLSelectElement).value).toBe("");
    fireEvent.keyDown(screen.getByRole("region", { name: "房源地图" }), { key: "ArrowRight" });
    fireEvent.change(picker, { target: { value: mit.id } });
    expect(engine.setView).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/本页 2/)).toBeTruthy();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onPageChange).not.toHaveBeenCalled();
    fireEvent.change(picker, { target: { value: "__proto__" } });
    expect(engine.setView).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "显示本页全部房源" }));
    expect(engine.fitBounds.mock.calls.at(-1)?.[0]).toHaveLength(2);
  });
});
