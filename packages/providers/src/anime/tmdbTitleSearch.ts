import { buildUrl, requestJson, type Fetcher } from "../shared/http.js";
import { TMDB_BASE_URL } from "../metadata/tmdb/request.js";

interface TmdbTitleSearchResponse {
  results?: Array<{
    id?: number;
    poster_path?: string | null;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
  }>;
}

const CACHE_LIMIT = 512;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; request: Promise<TmdbTitleSearchResponse> }>();

export function searchTmdbTitle(
  type: "movie" | "tv",
  query: string,
  year: number,
  includeAdult: boolean,
  apiKey: string,
  fetcher?: Fetcher
): Promise<TmdbTitleSearchResponse> {
  const params = {
    api_key: apiKey,
    language: "en-US",
    query,
    page: 1,
    include_adult: includeAdult,
    ...(year ? { [type === "movie" ? "year" : "first_air_date_year"]: year } : {})
  };
  const url = buildUrl(TMDB_BASE_URL, `/search/${type}`, params);
  if (fetcher) return requestJson("TMDB", url, { fetcher }) as Promise<TmdbTitleSearchResponse>;

  const key = String(url);
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    cache.delete(key);
    cache.set(key, existing);
    return existing.request;
  }
  if (existing) cache.delete(key);

  const request = requestJson("TMDB", url).then((value) => value as TmdbTitleSearchResponse);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, request });
  while (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  void request.catch(() => {
    if (cache.get(key)?.request === request) cache.delete(key);
  });
  return request;
}
