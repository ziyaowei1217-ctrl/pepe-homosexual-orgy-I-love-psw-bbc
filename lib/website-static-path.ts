export const WEBSITE_PUBLIC_ARTWORK_PATHS = [
  "/brand/psw-logo.svg", "/brand/psw-mark.svg", "/brand/psw-logo-white.svg", "/brand/psw-logo.png"
] as const;

// The host and Next may decode route names at different stages. Decode once,
// reject remaining encodings, and never treat ambiguous segments as public.
export function canonicalWebsitePath(pathname: string): string | null {
  if (/[\\\s\u0000-\u001f\u007f-\u009f?#]/.test(pathname)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes("%") || /[\\\s\u0000-\u001f\u007f-\u009f?#]/.test(decoded)) return null;
  if (decoded === "/") return decoded;
  const segments = decoded.split("/");
  if (segments[0] !== "" || segments.slice(1).some(segment => !segment || segment === "." || segment === "..")) return null;
  return decoded;
}

// Only canonical framework assets and exact inert artwork may skip document
// nonce/cache handling. Methods and the API boundary are checked before this.
export function isCanonicalWebsiteStaticPath(pathname: string) {
  // Encoded separators and dots can change route identity after dispatch.
  if (/%(?:2e|2f|5c)/i.test(pathname)) return false;
  const decoded = canonicalWebsitePath(pathname);
  if (decoded === null) return false;
  if (WEBSITE_PUBLIC_ARTWORK_PATHS.some(path => path === decoded)) return true;
  if (["/_next/image", "/favicon.ico", "/icon.svg", "/apple-icon.png"].includes(decoded)) return true;
  return decoded.startsWith("/_next/static/") && decoded.split("/").length > 3;
}
