/** Revocable listing photos must reach the API instead of Next's stale image cache. */
export function isFirstPartyListingMedia(
  src: unknown,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1"
) {
  if (typeof src !== "string") return false;
  try {
    const api = new URL(apiBaseUrl);
    const relative = src.startsWith("/") && !src.startsWith("//");
    const url = relative ? new URL(src, api.origin) : new URL(src);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === api.origin &&
      /^\/api\/v1\/listing-media\/[^/]+\/content$/.test(url.pathname);
  } catch {
    return false;
  }
}
