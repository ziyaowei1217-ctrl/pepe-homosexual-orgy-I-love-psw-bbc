import type { ReactNode } from "react";
import { preload } from "react-dom";

import { mapConnectionOrigins } from "@/lib/content-security-policy";
import { getMapStyle } from "@/lib/listing-map";

export default function SearchLayout({ children }: { children: ReactNode }) {
  const origins = mapConnectionOrigins(process.env.NEXT_PUBLIC_MAP_STYLE_URL, process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE);
  // The map fetches its style first: start that download with the page instead of after the map code arrives.
  const style = getMapStyle();
  if (typeof style === "string") preload(style, { as: "fetch", crossOrigin: "anonymous" });
  return <>
    {origins.map((origin) => <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />)}
    {children}
  </>;
}
