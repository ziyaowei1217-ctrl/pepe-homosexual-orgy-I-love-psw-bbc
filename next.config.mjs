const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
const apiOrigin = safeOrigin(apiBaseUrl);
const connectSources = ["'self'", apiOrigin, apiOrigin.replace(/^http/, "ws")].filter(Boolean).join(" ");
const production = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${apiOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src ${connectSources}`,
  ...(production ? ["upgrade-insecure-requests"] : [])
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    // In local Docker the browser's localhost API is outside the web container.
    // Let the browser request development images directly; production optimizes them.
    unoptimized: !production,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...remotePatternFor(apiBaseUrl)
    ]
  },
  async headers() {
    const headers = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
  try { return new URL(value).origin; } catch { return ""; }
}

function remotePatternFor(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    return [{ protocol: url.protocol.slice(0, -1), hostname: url.hostname, port: url.port || undefined }];
  } catch { return []; }
}

export default nextConfig;
