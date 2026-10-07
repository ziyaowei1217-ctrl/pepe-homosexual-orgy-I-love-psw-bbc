import { findUSMarketByArea, getMarketNeighborhoodCoordinates } from "./us-market-catalog";

export type MapPoint = {
  lat: number;
  lng: number;
};

export type MapSize = {
  width: number;
  height: number;
};

export type MappableListing = {
  id: string;
  area: string;
  price: number;
  title?: string;
  latitude?: number;
  longitude?: number;
};

export type MapMarkerPosition = MappableListing &
  MapPoint & {
    label: string;
    x: number;
    y: number;
  };

export type MapTile = {
  id: string;
  url: string;
  x: number;
  y: number;
  xTile: number;
  yTile: number;
  zoom: number;
};

export type MapSummary = {
  count: number;
  averagePrice: number;
  minimumPrice: number;
};

const tileSize = 256;
export const minMapZoom = 2;
export const maxMapZoom = 18;
export const maxMercatorLatitude = 85.0511287798066;
const maxViewportDimension = 8192;
const maxViewportTiles = 1024;
const laCenter: MapPoint = { lat: 34.0522, lng: -118.2437 };
const markerInset = {
  x: 64,
  y: 28
};

const neighborhoodCoordinates: Record<string, MapPoint> = {
  "Westwood": { lat: 34.0635, lng: -118.4455 },
  "Koreatown": { lat: 34.058, lng: -118.3004 },
  "Culver City": { lat: 34.0211, lng: -118.3965 },
  "Santa Monica": { lat: 34.0195, lng: -118.4912 },
  "Silver Lake": { lat: 34.0861, lng: -118.2702 },
  "Pasadena": { lat: 34.1478, lng: -118.1445 },
  "DTLA": { lat: 34.0407, lng: -118.2468 },
  "USC North": { lat: 34.0266, lng: -118.2831 },
  "Hollywood": { lat: 34.1016, lng: -118.3267 },
  "Burbank": { lat: 34.1808, lng: -118.309 },
  "Sawtelle": { lat: 34.0406, lng: -118.4426 },
  "Glendale": { lat: 34.1425, lng: -118.2551 },
  "Mar Vista": { lat: 34.005, lng: -118.4291 },
  "Echo Park": { lat: 34.0782, lng: -118.2606 },
  "Playa Vista": { lat: 33.976, lng: -118.4182 },
  "North Hollywood": { lat: 34.1729, lng: -118.379 },
  "Los Feliz": { lat: 34.1086, lng: -118.2879 },
  "Brentwood": { lat: 34.0521, lng: -118.473 },
  "Arts District": { lat: 34.0415, lng: -118.2356 },
  "El Segundo": { lat: 33.9192, lng: -118.4165 },
  "Palms": { lat: 34.0234, lng: -118.407 },
  "Venice": { lat: 33.9925, lng: -118.4695 },
  "Century City": { lat: 34.0555, lng: -118.4179 },
  "Highland Park": { lat: 34.1119, lng: -118.1986 },
  "Boston": { lat: 42.3601, lng: -71.0589 },
  "Back Bay": { lat: 42.3503, lng: -71.081 },
  "Fenway": { lat: 42.3467, lng: -71.0972 },
  "Allston": { lat: 42.3555, lng: -71.1328 },
  "Cambridge": { lat: 42.3736, lng: -71.1097 },
  "Somerville": { lat: 42.3876, lng: -71.0995 },
  "Seaport": { lat: 42.3519, lng: -71.0496 }
};

export function getListingCoordinates(area: string): MapPoint {
  const neighborhood = area.split("·").at(1)?.trim() ?? area.trim();
  const knownNeighborhood = Object.hasOwn(neighborhoodCoordinates, neighborhood) ? neighborhoodCoordinates[neighborhood] : undefined;
  if (knownNeighborhood) return knownNeighborhood;

  const market = findUSMarketByArea(area);
  if (market) return getMarketNeighborhoodCoordinates(market, neighborhood);

  return laCenter;
}

export function getMapCenterForListings(listings: MappableListing[], fallback: MapPoint = laCenter): MapPoint {
  if (listings.length === 0) return safeMapPoint(fallback);

  const points = listings.map(getListingPoint);
  return {
    lat: average(points.map((point) => point.lat)),
    lng: averageWrappedLongitude(points.map((point) => point.lng))
  };
}

export function getMapMarkers(
  listings: MappableListing[],
  center: MapPoint,
  zoom: number,
  size: MapSize,
  clampToViewport = true
): MapMarkerPosition[] {
  validateMapZoom(zoom);
  validateMapSize(size);
  const centerPixel = lngLatToWorldPixel(center, zoom);
  const worldWidth = tileSize * 2 ** zoom;

  return listings.map((listing) => {
    const point = getListingPoint(listing);
    const markerPixel = lngLatToWorldPixel(point, zoom);
    // Use the nearest copy of the world, including homes across the dateline.
    const offsetX = wrapWorldOffset(markerPixel.x - centerPixel.x, worldWidth);

    return {
      ...listing,
      ...point,
      label: `$${listing.price.toLocaleString("en-US")}`,
      x: Math.round(clampToViewport ? keepInsideViewport(offsetX + size.width / 2, size.width, markerInset.x) : offsetX + size.width / 2),
      y: Math.round(clampToViewport ? keepInsideViewport(markerPixel.y - centerPixel.y + size.height / 2, size.height, markerInset.y) : markerPixel.y - centerPixel.y + size.height / 2)
    };
  });
}

export function panMapCenter(center: MapPoint, zoom: number, dx: number, dy: number): MapPoint {
  validateMapZoom(zoom);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError("Map pan offsets must be finite");
  const pixel = lngLatToWorldPixel(center, zoom);
  const scale = tileSize * 2 ** zoom;
  const lng = (pixel.x - dx) / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * (pixel.y - dy) / scale;
  return { lat: Math.max(-maxMercatorLatitude, Math.min(maxMercatorLatitude, 180 / Math.PI * Math.atan(Math.sinh(n)))), lng: wrapLongitude(lng) };
}

export function getListingPoint(listing: MappableListing): MapPoint {
  if (isMapPoint({ lat: listing.latitude as number, lng: listing.longitude as number })) {
    return { lat: listing.latitude as number, lng: listing.longitude as number };
  }
  return getListingCoordinates(listing.area);
}

export function getMapTiles(center: MapPoint, zoom: number, size: MapSize): MapTile[] {
  validateMapZoom(zoom, true);
  validateMapSize(size);
  const centerPixel = lngLatToWorldPixel(center, zoom);
  const startX = Math.floor((centerPixel.x - size.width / 2) / tileSize);
  const endX = Math.floor((centerPixel.x + size.width / 2) / tileSize);
  const startY = Math.floor((centerPixel.y - size.height / 2) / tileSize);
  const endY = Math.floor((centerPixel.y + size.height / 2) / tileSize);
  if ((endX - startX + 1) * (endY - startY + 1) > maxViewportTiles) {
    throw new RangeError("Map viewport exceeds the tile budget");
  }
  const tiles: MapTile[] = [];
  const worldTileCount = 2 ** zoom;

  for (let xTile = startX; xTile <= endX; xTile += 1) {
    for (let yTile = startY; yTile <= endY; yTile += 1) {
      if (yTile < 0 || yTile >= worldTileCount) continue;
      const wrappedX = ((xTile % worldTileCount) + worldTileCount) % worldTileCount;
      tiles.push({
        id: `${zoom}-${xTile}-${yTile}`,
        url: mapTileUrl(wrappedX, yTile, zoom),
        x: Math.round(xTile * tileSize - centerPixel.x + size.width / 2),
        y: Math.round(yTile * tileSize - centerPixel.y + size.height / 2),
        xTile,
        yTile,
        zoom
      });
    }
  }

  return tiles;
}

export function getMapSummary(listings: MappableListing[]): MapSummary {
  if (listings.length === 0) {
    return {
      count: 0,
      averagePrice: 0,
      minimumPrice: 0
    };
  }

  const prices = listings.map((listing) => listing.price);

  return {
    count: listings.length,
    averagePrice: Math.round(average(prices)),
    minimumPrice: Math.min(...prices)
  };
}

export const defaultMapAttribution = "© OpenStreetMap contributors";

function defaultMapTileUrl(xTile: number, yTile: number, zoom: number) {
  return `https://tile.openstreetmap.de/${zoom}/${xTile}/${yTile}.png`;
}

export function mapTileUrl(
  xTile: number,
  yTile: number,
  zoom: number,
  template = process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE
) {
  validateMapZoom(zoom, true);
  const worldTileCount = 2 ** zoom;
  if (!Number.isInteger(xTile) || !Number.isInteger(yTile) || xTile < 0 || yTile < 0 || xTile >= worldTileCount || yTile >= worldTileCount) {
    throw new RangeError("Map tile coordinates must be inside the zoom level");
  }
  if (!template) return defaultMapTileUrl(xTile, yTile, zoom);
  if (!["{x}", "{y}", "{z}"].every((token) => template.includes(token))) {
    throw new Error("NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE must contain {z}, {x}, and {y}");
  }
  if (/[\\\u0000-\u0020\u007f]/.test(template) || /[{}]/.test(template.replace(/\{[xyz]\}/g, ""))) {
    throw new Error("Map tile template contains unsupported characters or placeholders");
  }
  const result = template
    .replaceAll("{z}", String(zoom))
    .replaceAll("{x}", String(xTile))
    .replaceAll("{y}", String(yTile));
  let url: URL;
  try { url = new URL(result); } catch { throw new Error("Map tile template must be an absolute HTTPS URL"); }
  // Public deployment templates may use public query keys; credentials and
  // fragments are never part of an image request. Tokens cannot change origin.
  const templateOrigin = template.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash || !templateOrigin || /[{}]/.test(templateOrigin)) {
    throw new Error("Map tile template must use credential-free HTTPS with a fixed origin and no fragment");
  }
  return result;
}

function lngLatToWorldPixel(point: MapPoint, zoom: number) {
  const safePoint = safeMapPoint(point);
  const sinLat = Math.sin((safePoint.lat * Math.PI) / 180);
  const scale = tileSize * 2 ** zoom;

  return {
    x: ((safePoint.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

export function isMapPoint(point: MapPoint) {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= maxMercatorLatitude &&
    Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

function safeMapPoint(point: MapPoint): MapPoint {
  return isMapPoint(point) ? point : laCenter;
}

function validateMapZoom(zoom: number, integer = false) {
  if (!Number.isFinite(zoom) || zoom < minMapZoom || zoom > maxMapZoom || (integer && !Number.isInteger(zoom))) {
    throw new RangeError(`Map zoom must be ${integer ? "an integer" : "finite"} from ${minMapZoom} to ${maxMapZoom}`);
  }
}

function validateMapSize(size: MapSize) {
  if (![size.width, size.height].every((dimension) => Number.isFinite(dimension) && dimension > 0 && dimension <= maxViewportDimension)) {
    throw new RangeError(`Map viewport dimensions must be positive and at most ${maxViewportDimension}`);
  }
}

function wrapLongitude(lng: number) {
  return ((lng + 180) % 360 + 360) % 360 - 180;
}

function wrapWorldOffset(offset: number, width: number) {
  return ((offset + width / 2) % width + width) % width - width / 2;
}

function averageWrappedLongitude(longitudes: number[]) {
  if (longitudes.length === 1) return longitudes[0];
  const sorted = longitudes.map(wrapLongitude).sort((left, right) => left - right);
  let largestGap = -1;
  let arcStart = sorted[0];
  for (let index = 0; index < sorted.length; index++) {
    const next = sorted[(index + 1) % sorted.length];
    const gap = (index === sorted.length - 1 ? next + 360 : next) - sorted[index];
    if (gap > largestGap) { largestGap = gap; arcStart = next; }
  }
  const offsets = sorted.map((lng) => ((lng - arcStart) % 360 + 360) % 360);
  return wrapLongitude(arcStart + average(offsets));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function keepInsideViewport(value: number, dimension: number, inset: number) {
  if (dimension <= inset * 2) return dimension / 2;

  return Math.min(dimension - inset, Math.max(inset, value));
}
