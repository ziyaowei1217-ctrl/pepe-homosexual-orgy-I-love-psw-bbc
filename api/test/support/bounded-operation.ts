export function runWithDeadline<T>(
  label: string,
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([Promise.resolve().then(operation), deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
