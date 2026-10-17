import { isRecord } from "../../shared/guards.js";
import { requestJson, type Fetcher } from "../../shared/http.js";
import type {
  AniDubAnime,
  AniDubBrowseOptions,
  AniDubBrowseResult,
  AniDubHealth,
  AniDubLookupResult,
  AniDubPagedBrowseOptions,
  AniDubParams,
  AniDubRequest,
  AniDubSearchItem,
  AniDubSearchOptions,
  AniDubSearchResult,
  AniDubTrendingResult
} from "./types.js";

export const ANIDUB_BASE_URL = "https://api.anidub.moe/v1";

export interface AniDubClient {
  getAnime(
    anilistId: number,
    options?: { language?: string; signal?: AbortSignal }
  ): Promise<AniDubAnime>;
  getAnimeByAniDubId(
    anidubId: number,
    options?: { language?: string; signal?: AbortSignal }
  ): Promise<AniDubAnime>;
  lookupAnime(
    anilistIds: readonly number[],
    options?: { language?: string; signal?: AbortSignal }
  ): Promise<AniDubLookupResult>;
  lookupAnimeByMalIds(
    malIds: readonly number[],
    options?: { language?: string; signal?: AbortSignal }
  ): Promise<AniDubLookupResult>;
  searchAnime(
    query: string,
    options?: AniDubSearchOptions & { signal?: AbortSignal }
  ): Promise<AniDubSearchResult>;
  browseAnime(
    options?: AniDubPagedBrowseOptions & { q?: string; signal?: AbortSignal }
  ): Promise<AniDubBrowseResult>;
  getTrending(options?: {
    limit?: number;
    language?: string;
    signal?: AbortSignal;
  }): Promise<AniDubTrendingResult>;
  getHealth(options?: { signal?: AbortSignal }): Promise<AniDubHealth>;
}

function buildAniDubUrl(path: string, params: AniDubParams = {}): URL {
  const url = new URL(`${ANIDUB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function createAniDubRequest(apiKey?: string, fetcher?: Fetcher): AniDubRequest {
  return (path, params = {}, options = {}) =>
    requestJson("AniDub", buildAniDubUrl(path, params), {
      method: options.method,
      body: options.body,
      signal: options.signal,
      fetcher,
      headers: apiKey ? { "X-Api-Key": apiKey } : undefined
    });
}

function isAnime(value: unknown): value is AniDubAnime {
  return isRecord(value) && typeof value.anilistId === "number";
}

function isSearchItem(value: unknown): value is AniDubSearchItem {
  return isRecord(value) && typeof value.anilistId === "number";
}

function checkedLookup(result: unknown, name: string): AniDubLookupResult {
  if (!isRecord(result) || !Array.isArray(result.results))
    throw new Error(`Invalid AniDub ${name} response`);
  return {
    results: result.results.filter(isAnime),
    notFound: Array.isArray(result.notFound)
      ? result.notFound.filter((id): id is number => typeof id === "number")
      : []
  };
}

function filters(options: AniDubBrowseOptions): AniDubParams {
  return {
    genre: options.genre,
    format: options.format,
    yearFrom: options.yearFrom,
    yearTo: options.yearTo,
    year: options.year,
    season: options.season,
    dubStatus: options.dubStatus,
    dubbed: options.dubbed,
    status: options.status,
    adult: options.adult,
    list: options.list,
    sort: options.sort,
    language: options.language ?? "en",
    limit: options.limit
  };
}

export function createAniDubClient(request: AniDubRequest = createAniDubRequest()): AniDubClient {
  return {
    async getAnime(anilistId, options = {}) {
      const result = await request(
        `/anime/${encodeURIComponent(String(anilistId))}`,
        {
          language: options.language ?? "en"
        },
        { signal: options.signal }
      );
      if (!isAnime(result)) throw new Error("Invalid AniDub anime response");
      return result;
    },
    async getAnimeByAniDubId(anidubId, options = {}) {
      const result = await request(
        `/anime/by-anidub/${encodeURIComponent(String(anidubId))}`,
        {
          language: options.language ?? "en"
        },
        { signal: options.signal }
      );
      if (!isAnime(result)) throw new Error("Invalid AniDub anime response");
      return result;
    },
    async lookupAnime(anilistIds, options = {}) {
      if (!anilistIds.length) return { results: [], notFound: [] };
      if (anilistIds.length > 50) throw new Error("AniDub supports at most 50 titles per lookup");
      return checkedLookup(
        await request(
          "/anime/lookup",
          {},
          {
            method: "POST",
            body: { ids: [...anilistIds], language: options.language ?? "en" },
            signal: options.signal
          }
        ),
        "lookup"
      );
    },
    async lookupAnimeByMalIds(malIds, options = {}) {
      if (!malIds.length) return { results: [], notFound: [] };
      if (malIds.length > 50) throw new Error("AniDub supports at most 50 titles per lookup");
      return checkedLookup(
        await request(
          "/anime/lookup-mal",
          {},
          {
            method: "POST",
            body: { ids: [...malIds], language: options.language ?? "en" },
            signal: options.signal
          }
        ),
        "MAL lookup"
      );
    },
    async searchAnime(query, options = {}) {
      const result = await request(
        "/anime/search",
        {
          ...filters(options),
          q: query,
          limit: options.limit ?? 20
        },
        { signal: options.signal }
      );
      if (!isRecord(result) || !Array.isArray(result.results))
        throw new Error("Invalid AniDub search response");
      return {
        query: typeof result.query === "string" ? result.query : query,
        results: result.results.filter(isSearchItem)
      };
    },
    async browseAnime(options = {}) {
      const result = await request(
        "/anime/browse",
        {
          ...filters(options),
          q: options.q,
          page: options.page ?? 1,
          limit: options.limit ?? 20
        },
        { signal: options.signal }
      );
      if (!isRecord(result) || !Array.isArray(result.results))
        throw new Error("Invalid AniDub browse response");
      return {
        results: result.results.filter(isSearchItem),
        page: typeof result.page === "number" ? result.page : (options.page ?? 1),
        hasMore: result.hasMore === true,
        total: typeof result.total === "number" ? result.total : result.results.length
      };
    },
    async getTrending(options = {}) {
      const result = await request(
        "/anime/trending",
        {
          limit: options.limit ?? 20,
          language: options.language ?? "en"
        },
        { signal: options.signal }
      );
      if (!isRecord(result) || !Array.isArray(result.results))
        throw new Error("Invalid AniDub trending response");
      return {
        period: typeof result.period === "string" ? result.period : "",
        results: result.results.filter(isSearchItem)
      };
    },
    async getHealth(options = {}) {
      const result = await request("/health", {}, { signal: options.signal });
      if (!isRecord(result) || typeof result.status !== "string")
        throw new Error("Invalid AniDub health response");
      return {
        status: result.status,
        ...(typeof result.version === "string" ? { version: result.version } : {}),
        ...(typeof result.timestamp === "string" ? { timestamp: result.timestamp } : {})
      };
    }
  };
}
