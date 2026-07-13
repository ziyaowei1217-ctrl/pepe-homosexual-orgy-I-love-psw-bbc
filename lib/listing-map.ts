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
  "El Segundo": { lat: 33.9192, lng: -118.4165 }
};

export function getListingCoordinates(area: string): MapPoint {
  const neighborhood = area.split("·").at(1)?.trim() ?? area.trim();

  return neighborhoodCoordinates[neighborhood] ?? laCenter;
}

export function getMapCenterForListings(listings: MappableListing[], fallback: MapPoint = laCenter): MapPoint {
  if (listings.length === 0) return fallback;

  const points = listings.map((listing) => getListingCoordinates(listing.area));
  return {
    lat: average(points.map((point) => point.lat)),
    lng: average(points.map((point) => point.lng))
  };
}

export function getMapMarkers(
  listings: MappableListing[],
  center: MapPoint,
  zoom: number,
  size: MapSize
): MapMarkerPosition[] {
  const centerPixel = lngLatToWorldPixel(center, zoom);

  return listings.map((listing) => {
    const point = getListingCoordinates(listing.area);
    const markerPixel = lngLatToWorldPixel(point, zoom);

    return {
      ...listing,
      ...point,
      label: `$${listing.price.toLocaleString()}`,
      x: Math.round(keepInsideViewport(markerPixel.x - centerPixel.x + size.width / 2, size.width, markerInset.x)),
      y: Math.round(keepInsideViewport(markerPixel.y - centerPixel.y + size.height / 2, size.height, markerInset.y))
    };
  });
}

export function getMapTiles(center: MapPoint, zoom: number, size: MapSize): MapTile[] {
  const centerPixel = lngLatToWorldPixel(center, zoom);
  const startX = Math.floor((centerPixel.x - size.width / 2) / tileSize);
  const endX = Math.floor((centerPixel.x + size.width / 2) / tileSize);
  const startY = Math.floor((centerPixel.y - size.height / 2) / tileSize);
  const endY = Math.floor((centerPixel.y + size.height / 2) / tileSize);
  const tiles: MapTile[] = [];

  for (let xTile = startX; xTile <= endX; xTile += 1) {
    for (let yTile = startY; yTile <= endY; yTile += 1) {
      tiles.push({
        id: `${zoom}-${xTile}-${yTile}`,
        url: osmTileUrl(xTile, yTile, zoom),
        x: xTile * tileSize - centerPixel.x + size.width / 2,
        y: yTile * tileSize - centerPixel.y + size.height / 2,
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

export function osmTileUrl(xTile: number, yTile: number, zoom: number) {
  return `https://tile.openstreetmap.org/${zoom}/${xTile}/${yTile}.png`;
}

function lngLatToWorldPixel(point: MapPoint, zoom: number) {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const scale = tileSize * 2 ** zoom;

  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function keepInsideViewport(value: number, dimension: number, inset: number) {
  if (dimension <= inset * 2) return dimension / 2;

  return Math.min(dimension - inset, Math.max(inset, value));
}
