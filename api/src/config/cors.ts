const defaultDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001"
];

export function getCorsOrigins(webOrigin?: string) {
  if (!webOrigin) return defaultDevOrigins;

  return webOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
