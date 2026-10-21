import type { MapMarkerPosition } from "./listing-map";

type Cluster = { x: number; y: number; items: MapMarkerPosition[] };

// Rough on-screen size of a pin: a price pill is about 84 × 38, a cluster pill ("12 套房源") about 112 × 38.
const pinWidth = (cluster: Cluster) => (cluster.items.length > 1 ? 112 : 84);
const PIN_HEIGHT = 38;
const GAP = 6;

function overlaps(a: Cluster, b: Cluster) {
  return Math.abs(a.x - b.x) < (pinWidth(a) + pinWidth(b)) / 2 + GAP && Math.abs(a.y - b.y) < PIN_HEIGHT + GAP;
}

function merge(into: Cluster, from: Cluster) {
  const total = into.items.length + from.items.length;
  into.x = (into.x * into.items.length + from.x * from.items.length) / total;
  into.y = (into.y * into.items.length + from.y * from.items.length) / total;
  into.items.push(...from.items);
}

/**
 * Groups pins that would overlap on screen. A group grows wider once it shows "N 套房源" and its centre moves,
 * so groups are merged again until no two pills touch.
 */
export function clusterSearchMarkers(markers: MapMarkerPosition[]) {
  const groups: Cluster[] = [];
  for (const marker of markers) {
    const single: Cluster = { x: marker.x, y: marker.y, items: [marker] };
    const group = groups.find((item) => overlaps(item, single));
    if (group) merge(group, single);
    else groups.push(single);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < groups.length && !changed; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (overlaps(groups[i], groups[j])) {
          merge(groups[i], groups[j]);
          groups.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return groups;
}
