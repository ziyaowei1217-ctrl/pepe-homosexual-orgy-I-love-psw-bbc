const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
const demo = process.env.NEXT_PUBLIC_WEBSITE_DEMO === "true";
const apiOrigin = demo ? "" : safeOrigin(apiBaseUrl);
// MapLibre fetches the basemap style and tiles itself; keep in step with getMapStyle in lib/listing-map.ts.
const mapStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
const mapTileTemplate = process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE || "";
const mapOrigins = demo || (!mapStyleUrl && !mapTileTemplate) ? ["https://tiles.openfreemap.org"] : [safeOrigin(mapStyleUrl), safeOrigin(mapTileTemplate)];
const connectSources = [...new Set(["'self'", apiOrigin, apiOrigin.replace(/^http/, "ws"), ...mapOrigins].filter(Boolean))].join(" ");
const production = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  demo
    ? "img-src 'self' data: blob: https://images.unsplash.com https://tiles.openfreemap.org"
    : `img-src ${[...new Set(["'self'", "data:", "blob:", "https://images.unsplash.com", apiOrigin, ...mapOrigins].filter(Boolean))].join(" ")}`,
  "font-src 'self' data:",
  `connect-src ${connectSources}`,
  // MapLibre renders tiles in a web worker it starts from a blob.
  "worker-src 'self' blob:",
  ...(production ? ["upgrade-insecure-requests"] : [])
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    // In local Docker the browser's localhost API is outside the web container.
    // Let the browser request development images directly; production optimizes them.
    unoptimized: !production,
    minimumCacheTTL: 0,
    localPatterns: [],
    // Authenticated/revocable uploads must use the media helper directly, never
    // the optimizer's public cache or its server-side access to API addresses.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }]
  },
  async headers() {
    const headers = [
      // Production documents receive a fresh nonce in middleware. Static CSP
      // here would conflict with that request-specific policy.
      ...(!production ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
    ];
    if (production) {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers }];
  }
};

function safeOrigin(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.origin : "";
  } catch { return ""; }
}

export default nextConfig;
