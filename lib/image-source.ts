/** Prevent user-controlled image fields from contacting unrelated tracking hosts. */
export function isTrustedImageSource(value: string, apiBase = process.env.NEXT_PUBLIC_API_BASE_URL): boolean {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
  try {
    const image = new URL(value);
    if (image.username || image.password) return false;
    if (image.protocol === "blob:") return typeof window !== "undefined" && image.origin === window.location.origin;
    if (image.origin === "https://images.unsplash.com") return true;
    if (!apiBase) return false;
    const api = new URL(apiBase);
    if (api.username || api.password || !["http:", "https:"].includes(api.protocol)) return false;
    return image.origin === api.origin;
  } catch { return false; }
}
