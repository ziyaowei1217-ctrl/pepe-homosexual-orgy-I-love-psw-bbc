import { NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy, isHttpLoopbackRequest } from "./lib/content-security-policy";
import { canBrowseWebsiteDemo, isWebsiteDemo } from "./lib/website-demo";

export function middleware(request: NextRequest) {
  const demo = isWebsiteDemo();
  // Netlify's static header rules do not cover SSR or middleware responses.
  const demoHeaders: Record<string, string> = demo ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {};
  if (demo && !["GET", "HEAD"].includes(request.method)) {
    return NextResponse.json({ code: "WEBSITE_DEMO_READ_ONLY" }, { status: 403, headers: { ...demoHeaders, "Cache-Control": "no-store" } });
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (demo && request.nextUrl.pathname !== "/api/health") {
      return NextResponse.json({ code: "WEBSITE_DEMO_READ_ONLY" }, { status: 403, headers: { ...demoHeaders, "Cache-Control": "no-store" } });
    }
    return NextResponse.next({ headers: demoHeaders });
  }
  const unavailable = demo && !canBrowseWebsiteDemo(request.nextUrl.pathname);
  const destination = request.nextUrl.clone();
  destination.pathname = "/demo";
  destination.search = "";
  if (process.env.NODE_ENV !== "production") {
    return unavailable ? NextResponse.rewrite(destination, { headers: demoHeaders }) : NextResponse.next({ headers: demoHeaders });
  }

  const nonce = btoa(crypto.randomUUID());
  const loopback = isHttpLoopbackRequest(request.nextUrl.protocol, request.headers.get("host"));
  const policy = buildContentSecurityPolicy(
    nonce,
    demo ? "" : process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
    demo ? undefined : process.env.NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN,
    // WebKit upgrades even HTTP loopback assets, which breaks local standalone
    // previews. Public hosts and all HTTPS requests retain HTTPS upgrading.
    !loopback
  );
  const requestHeaders = new Headers(request.headers);
  // Overwrite client-supplied values; Next extracts the nonce from this policy
  // and applies it to framework and hydration scripts during rendering.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = unavailable
    ? NextResponse.rewrite(destination, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  // A cached document cannot safely reuse its per-request script nonce.
  response.headers.set("Cache-Control", "private, no-store");
  if (demo) response.headers.set("X-Robots-Tag", demoHeaders["X-Robots-Tag"]);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"]
};
