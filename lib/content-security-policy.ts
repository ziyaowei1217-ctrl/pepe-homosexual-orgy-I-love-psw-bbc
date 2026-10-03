function httpOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
}

export function isHttpLoopbackRequest(protocol: string, authority: string | null) {
  if (protocol !== "http:" || !authority) return false;
  // The incoming Host represents the browser origin. Next may instead expose
  // the server's wildcard bind address in nextUrl when running standalone.
  // Accept only exact loopback authorities, with an optional valid port.
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(authority)) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(`http://${authority}`).hostname);
  } catch {
    return false;
  }
}

export function buildContentSecurityPolicy(nonce: string, apiUrl: string, uploadOrigin?: string, upgradeRequests = true) {
  const apiOrigin = httpOrigin(apiUrl);
  const upload = httpOrigin(uploadOrigin);
  const connections = ["'self'", apiOrigin, apiOrigin.replace(/^http/, "ws"), upload].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // React styles and the map's positioned markers use inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${apiOrigin}`.trim(),
    "font-src 'self' data:",
    `connect-src ${connections}`,
    ...(upgradeRequests ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}
