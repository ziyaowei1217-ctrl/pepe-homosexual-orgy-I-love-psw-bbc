export type DisposableSocketAdapter = { dispose(): Promise<void> };

export function installSocketAdapter<T extends DisposableSocketAdapter>(
  install: (adapter: T) => unknown,
  ownership: { detachedSocketAdapter?: T },
  adapter: T
): void {
  ownership.detachedSocketAdapter = adapter;
  install(adapter);
  ownership.detachedSocketAdapter = undefined;
}

export async function disposeDetachedSocketAdapter<T extends DisposableSocketAdapter>(ownership: {
  detachedSocketAdapter?: T;
}): Promise<void> {
  const adapter = ownership.detachedSocketAdapter;
  if (!adapter) return;
  ownership.detachedSocketAdapter = undefined;
  await adapter.dispose();
}

export function isolatedValkeySmokeFailureMessage(result: {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  stderr?: string;
  stdout?: string;
}): string {
  const diagnostics = [result.error?.message, result.stderr, result.stdout]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return [
    `isolated Valkey realtime smoke failed (status=${result.status ?? "null"}, signal=${result.signal ?? "none"})`,
    ...diagnostics
  ].join("\n");
}
