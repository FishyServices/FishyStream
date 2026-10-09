export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function recover<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (isAbortError(error)) throw error;
    return fallback;
  }
}

export function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function memoizeAsync<Args extends unknown[], Result>(
  load: (...args: Args) => Promise<Result>,
  keyOf: (...args: Args) => string,
  limit = 500
): (...args: Args) => Promise<Result> {
  const cache = new Map<string, Promise<Result>>();
  return (...args) => {
    const key = keyOf(...args);
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = load(...args).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    if (cache.size > limit) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return pending;
  };
}
