import { NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy, DEMO_MAP_ORIGIN, isHttpLoopbackRequest, mapConnectionOrigins } from "./lib/content-security-policy";
import { canonicalWebsitePath, isCanonicalWebsiteStaticPath } from "./lib/website-static-path";

export function middleware(request: NextRequest) {
  const demo = process.env.NEXT_PUBLIC_WEBSITE_DEMO === "true";
  const demoHeaders: Record<string, string> = demo ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {};
  const denied = (code: string, status = 403) => NextResponse.json({ code }, {
    status, headers: { ...demoHeaders, "Cache-Control": "no-store" }
  });
  // Demo interactions are a browser-local simulation. No form submission,
  // Server Action, upload, assistant provider or real backend write is allowed.
  if (demo && !["GET", "HEAD"].includes(request.method)) return denied("WEBSITE_DEMO_LOCAL_ONLY");
  const path = canonicalWebsitePath(request.nextUrl.pathname);
  if (demo && path === null) return denied("INVALID_WEBSITE_PATH", 400);
  if (path === "/api" || path?.startsWith("/api/")) {
    if (demo && (path !== "/api/health" || request.nextUrl.pathname !== "/api/health")) {
      return denied("WEBSITE_DEMO_LOCAL_ONLY");
    }
    if (path === "/api/auth" || path?.startsWith("/api/auth/")) {
      // Preserve the actual URL through Netlify's Next adapter. A warm server
      // otherwise keeps the hostname of its first request after preview promotion.
      // The response headers also keep this same-URL rewrite from being elided.
      // Netlify binds its public-URL metadata to the platform request ID; auth's
      // exact origin allowlist and all callback/CSRF checks still run downstream.
      return NextResponse.rewrite(request.nextUrl, { headers: {
        ...demoHeaders, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"
      } });
    }
    return NextResponse.next({ headers: demoHeaders });
  }
  // Methods and API guards run before asset exclusions, including encoded paths.
  if (isCanonicalWebsiteStaticPath(request.nextUrl.pathname)) return NextResponse.next({ headers: demoHeaders });
  if (process.env.NODE_ENV !== "production") return NextResponse.next({ headers: demoHeaders });

  const nonce = btoa(crypto.randomUUID());
  const policy = buildContentSecurityPolicy(
    nonce,
    demo ? "" : process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
    demo ? undefined : process.env.NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN,
    !isHttpLoopbackRequest(request.nextUrl.protocol, request.headers.get("host")),
    demo ? [DEMO_MAP_ORIGIN] : mapConnectionOrigins(process.env.NEXT_PUBLIC_MAP_STYLE_URL, process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE),
    demo
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  if (demo) response.headers.set("X-Robots-Tag", demoHeaders["X-Robots-Tag"]);
  return response;
}

export const config = { matcher: ["/(.*)"] };
