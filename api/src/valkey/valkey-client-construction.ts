export type ValkeyClientConstruction<T> =
  | { ok: true; client: T }
  | { ok: false; reason: "protocol" };

export function constructValkeyClient<T>(
  url: string,
  factory: (url: string) => T
): ValkeyClientConstruction<T> {
  try {
    const client = factory(url);
    if (!client) return { ok: false, reason: "protocol" };
    return { ok: true, client };
  } catch {
    return { ok: false, reason: "protocol" };
  }
}
