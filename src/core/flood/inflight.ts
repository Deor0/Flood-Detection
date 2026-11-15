/**
 * Shares one running promise per key: a second caller with the same key while the first is still
 * working gets the same promise instead of starting its own. The entry is removed once it settles,
 * so a failure is never cached and the next call tries again.
 */
export function dedupe<T>(
  map: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const running = map.get(key);
  if (running) return running;
  const promise = run().finally(() => {
    if (map.get(key) === promise) map.delete(key);
  });
  map.set(key, promise);
  return promise;
}
