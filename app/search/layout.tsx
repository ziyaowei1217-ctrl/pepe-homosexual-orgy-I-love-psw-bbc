import type { ReactNode } from "react";

import { mapConnectionOrigins } from "@/lib/content-security-policy";

export default function SearchLayout({ children }: { children: ReactNode }) {
  const origins = mapConnectionOrigins(process.env.NEXT_PUBLIC_MAP_STYLE_URL, process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE);
  return <>
    {origins.map((origin) => <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />)}
    {children}
  </>;
}
