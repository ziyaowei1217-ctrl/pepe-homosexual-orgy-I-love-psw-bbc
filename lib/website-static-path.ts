// Decode once and reject path forms whose identity can change between the host,
// middleware and Next router. Query strings must never be included here.
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

export function isCanonicalWebsiteStaticPath(pathname: string) {
  if (/%(?:2e|2f|5c)/i.test(pathname)) return false;
  const decoded = canonicalWebsitePath(pathname);
  if (decoded === null) return false;
  if (["/_next/image", "/favicon.ico", "/icon.svg", "/apple-icon.png"].includes(decoded)) return true;
  if (/^\/fonts\/psw\/(?:rounded-bold-(?:core|0[1-9]|1[0-6])|slogan-heavy)\.woff2$/.test(decoded)) return true;
  if (/^\/vendor\/maplibre\/\d+\.\d+\.\d+\/maplibre-gl-(?:worker|shared)\.mjs$/.test(decoded)) return true;
  return decoded.startsWith("/_next/static/") && decoded.split("/").length > 3;
}
