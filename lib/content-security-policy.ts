function httpOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export const DEMO_MAP_ORIGIN = "https://tiles.openfreemap.org";

/** The style, glyphs, sprites and vector tiles of the default MapLibre basemap share this origin. */
export function mapConnectionOrigins(styleUrl?: string, tileTemplate?: string) {
  return styleUrl || tileTemplate
    ? [...new Set([httpOrigin(styleUrl), httpOrigin(tileTemplate)].filter(Boolean))]
    : [DEMO_MAP_ORIGIN];
}

export function isHttpLoopbackRequest(protocol: string, authority: string | null) {
  if (protocol !== "http:" || !authority) return false;
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(authority)) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(`http://${authority}`).hostname);
  } catch {
    return false;
  }
}

export function buildContentSecurityPolicy(
  nonce: string,
  apiUrl: string,
  uploadOrigin?: string,
  upgradeRequests = true,
  mapOrigins: string[] = [DEMO_MAP_ORIGIN],
  demo = false
) {
  const apiOrigin = httpOrigin(apiUrl);
  const upload = httpOrigin(uploadOrigin);
  const connections = [...new Set([
    "'self'", apiOrigin, apiOrigin.replace(/^http/, "ws"), upload,
    ...mapOrigins.map(httpOrigin)
  ].filter(Boolean))].join(" ");
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // React and MapLibre position elements through inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${[...new Set(["'self'", "data:", "blob:", "https://images.unsplash.com", ...(demo ? [DEMO_MAP_ORIGIN] : [apiOrigin, ...mapOrigins.map(httpOrigin)])].filter(Boolean))].join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connections}`,
    // Worker permissions are separate from the document's nonce script policy.
    "worker-src 'self' blob:",
    ...(upgradeRequests ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}
