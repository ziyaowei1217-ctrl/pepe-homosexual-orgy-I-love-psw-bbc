import type { MapMarkerPosition } from "./listing-map";

export function clusterSearchMarkers(markers: MapMarkerPosition[]) {
  const groups: { x: number; y: number; items: MapMarkerPosition[] }[] = [];
  const incomingOrder = new Map(markers.map((marker, index) => [marker, index]));
  // Price sorting must not move homes between clusters. Build membership in a
  // stable order, then restore the catalog order inside each selection picker.
  const ordered = [...markers].sort((left, right) =>
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0) || left.x - right.x || left.y - right.y
  );
  for (const marker of ordered) {
    const group = groups.find((item) => Math.abs(item.x - marker.x) < 82 && Math.abs(item.y - marker.y) < 42);
    if (group) {
      const count = group.items.length;
      group.x = (group.x * count + marker.x) / (count + 1);
      group.y = (group.y * count + marker.y) / (count + 1);
      group.items.push(marker);
    } else groups.push({ x: marker.x, y: marker.y, items: [marker] });
  }
  for (const group of groups) {
    group.items.sort((left, right) => incomingOrder.get(left)! - incomingOrder.get(right)!);
  }
  return groups;
}
