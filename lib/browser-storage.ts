// Storage getters themselves can throw in private or embedded browsers.
export function getBrowserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind] ?? null;
  } catch {
    return null;
  }
}
