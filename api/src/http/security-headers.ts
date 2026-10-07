type SecurityHeaderResponse = { setHeader(name: string, value: string): unknown };

export function securityHeadersMiddleware(
  _request: unknown,
  response: SecurityHeaderResponse,
  next: () => void
) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  // Auth codes, tokens and private account data must never enter browser or shared caches.
  // Public binary controllers deliberately override this after checking their visibility.
  response.setHeader("Cache-Control", "private, no-store");
  next();
}
