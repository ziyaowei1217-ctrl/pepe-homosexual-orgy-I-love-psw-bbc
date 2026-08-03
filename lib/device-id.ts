const deviceIdStorageKey = "sublet_device_id";

export function getBrowserDeviceId() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return undefined;

  try {
    const stored = window.localStorage.getItem(deviceIdStorageKey);
    if (stored && isUuid(stored)) return stored.toLowerCase();
    if (typeof globalThis.crypto?.randomUUID !== "function") return undefined;
    const generated = globalThis.crypto.randomUUID();
    window.localStorage.setItem(deviceIdStorageKey, generated);
    return generated;
  } catch {
    return undefined;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
