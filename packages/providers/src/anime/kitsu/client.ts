import { isRecord } from "../../shared/guards.js";
import { buildUrl, requestJson, type Fetcher } from "../../shared/http.js";
import type { KitsuAnime, KitsuEpisode, KitsuPage, KitsuRequest, KitsuResource } from "./types.js";

export const KITSU_BASE_URL = "https://kitsu.io/api/edge";
export const KITSU_ACCEPT = "application/vnd.api+json";

export interface KitsuPageOptions {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface KitsuAnimeSearchOptions extends KitsuPageOptions {
  sort?: "-userCount" | "-averageRating" | "canonicalTitle" | "startDate" | "-startDate";
  subtype?: string;
  status?: string;
  season?: string;
  seasonYear?: number;
  ageRating?: string;
  category?: string;
}

export interface KitsuClient {
  searchAnime(query: string, options?: KitsuAnimeSearchOptions): Promise<KitsuPage<KitsuAnime>>;
  getAnime(id: string | number, signal?: AbortSignal): Promise<KitsuAnime>;
  getAnimeEpisodes(
    id: string | number,
    options?: KitsuPageOptions
  ): Promise<KitsuPage<KitsuEpisode>>;
  getGenres(options?: KitsuPageOptions): Promise<KitsuPage<KitsuResource>>;
  getCategories(options?: KitsuPageOptions): Promise<KitsuPage<KitsuResource>>;
}

export function createKitsuRequest(fetcher?: Fetcher): KitsuRequest {
  return (path, params = {}, signal) =>
    requestJson("Kitsu", buildUrl(KITSU_BASE_URL, path, params), {
      headers: { Accept: KITSU_ACCEPT },
      fetcher,
      signal
    });
}

function parseResourcePage<T>(value: unknown, type: string): KitsuPage<T> {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error(`Invalid Kitsu ${type} response`);
  }
  return value as unknown as KitsuPage<T>;
}

function parseResource<T>(value: unknown, type: string): T {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error(`Invalid Kitsu ${type} response`);
  }
  return value.data as T;
}

const pageParams = (options: KitsuPageOptions = {}) => ({
  "page[limit]": options.limit ?? 20,
  "page[offset]": options.offset ?? 0
});

export function createKitsuClient(request: KitsuRequest = createKitsuRequest()): KitsuClient {
  const idPath = (id: string | number) => encodeURIComponent(String(id));
  return {
    searchAnime: async (query, options = {}) =>
      parseResourcePage<KitsuAnime>(
        await request(
          "/anime",
          {
            ...pageParams(options),
            "filter[text]": query || undefined,
            sort: options.sort ?? "-userCount",
            "filter[subtype]": options.subtype,
            "filter[status]": options.status,
            "filter[season]": options.season,
            "filter[seasonYear]": options.seasonYear,
            "filter[ageRating]": options.ageRating,
            "filter[categories]": options.category
          },
          options.signal
        ),
        "anime list"
      ),
    getAnime: async (id, signal) =>
      parseResource<KitsuAnime>(
        await request(`/anime/${idPath(id)}`, {}, signal),
        "anime"
      ),
    getAnimeEpisodes: async (id, options = {}) =>
      parseResourcePage<KitsuEpisode>(
        await request(`/anime/${idPath(id)}/episodes`, pageParams(options), options.signal),
        "episode list"
      ),
    getGenres: async (options = {}) =>
      parseResourcePage<KitsuResource>(await request("/genres", pageParams(options), options.signal), "genre list"),
    getCategories: async (options = {}) =>
      parseResourcePage<KitsuResource>(
        await request("/categories", pageParams(options), options.signal),
        "category list"
      )
  };
}
