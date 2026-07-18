import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_BASE_URL_2 } from "./constants.js";

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

class SimpleCache<K, V> {
  private store = new Map<string, CacheEntry<V>>();
  private keySerializer: (key: K) => string;

  constructor(keySerializer?: (key: K) => string) {
    this.keySerializer = keySerializer ?? ((k) => JSON.stringify(k));
  }

  get(key: K): V | undefined {
    const s = this.keySerializer(key);
    const entry = this.store.get(s);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.store.delete(s);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlSeconds: number): void {
    this.store.set(this.keySerializer(key), {
      value,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  clear(): void {
    this.store.clear();
  }
}

interface TMDBCacheKey {
  url: string;
  params: Record<string, string>;
  language: string;
}

const _serverCache = new SimpleCache<TMDBCacheKey, unknown>(
  (k) => `${k.url}|${JSON.stringify(k.params)}|${k.language}`
);

let _proxyIndex = 0;
function _nextProxy(proxyUrls: string[]): string | undefined {
  if (!proxyUrls.length) return undefined;
  return proxyUrls[_proxyIndex++ % proxyUrls.length];
}

function _isV4Token(key: string): boolean {
  return key.split(".").length === 3;
}

export async function tmdbGet<T>(
  endpoint: string,
  params: Record<string, string> = {},
  proxyUrls: string[] = []
): Promise<T | null> {
  const language = params.language ?? "en-US";
  const cacheKey: TMDBCacheKey = { url: endpoint, params, language };
  const cached = _serverCache.get(cacheKey);
  if (cached !== undefined) return cached as T;

  const apiKey = TMDB_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (_isV4Token(apiKey)) headers.Authorization = `Bearer ${apiKey}`;

  const allParams = {
    ...params,
    language,
    ...(!_isV4Token(apiKey) ? { api_key: apiKey } : {})
  };

  const buildUrl = (base: string) => {
    const url = new URL(base + endpoint);
    for (const [k, v] of Object.entries(allParams)) {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
    }
    return url.toString();
  };

  let result: T | null = null;

  const proxy = _nextProxy(proxyUrls);
  if (proxy) {
    try {
      const res = await fetch(
        `${proxy}/?destination=${encodeURIComponent(buildUrl(TMDB_BASE_URL))}`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) result = (await res.json()) as T;
    } catch {
      /* fall through */
    }
  }

  if (!result) {
    try {
      const res = await fetch(buildUrl(TMDB_BASE_URL), {
        headers,
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) result = (await res.json()) as T;
    } catch {
      /* fall through */
    }
  }

  if (!result) {
    try {
      const res = await fetch(buildUrl(TMDB_BASE_URL_2), {
        headers,
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) result = (await res.json()) as T;
    } catch {
      return null;
    }
  }

  if (result) _serverCache.set(cacheKey, result, 3600);
  return result;
}
