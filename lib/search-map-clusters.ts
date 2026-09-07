import type { MapMarkerPosition } from "./listing-map";

export function clusterSearchMarkers(markers: MapMarkerPosition[]) {
  const groups: { x: number; y: number; items: MapMarkerPosition[] }[] = [];
  for (const marker of markers) {
    const group = groups.find((item) => Math.abs(item.x - marker.x) < 82 && Math.abs(item.y - marker.y) < 42);
    if (group) {
      const count = group.items.length;
      group.x = (group.x * count + marker.x) / (count + 1);
      group.y = (group.y * count + marker.y) / (count + 1);
      group.items.push(marker);
    } else groups.push({ x: marker.x, y: marker.y, items: [marker] });
  }
  return groups;
}
