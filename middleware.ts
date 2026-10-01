import { NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy } from "./lib/content-security-policy";

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname);
  const policy = buildContentSecurityPolicy(
    nonce,
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
    process.env.NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN,
    // WebKit upgrades even HTTP loopback assets, which breaks local standalone
    // previews. Public hosts and all HTTPS requests retain HTTPS upgrading.
    request.nextUrl.protocol !== "http:" || !loopback
  );
  const requestHeaders = new Headers(request.headers);
  // Overwrite client-supplied values; Next extracts the nonce from this policy
  // and applies it to framework and hydration scripts during rendering.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  // A cached document cannot safely reuse its per-request script nonce.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"]
};
