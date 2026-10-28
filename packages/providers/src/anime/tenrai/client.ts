import { isRecord } from "../../shared/guards.js";
import { buildUrl, requestJson } from "../../shared/http.js";
import type { AnimeSeason } from "../types.js";
import { parseAnime, parseEpisode, parsePage, parseRecommendation } from "./parse.js";
import type {
  TenraiAnime,
  TenraiEpisode,
  TenraiPage,
  TenraiParams,
  TenraiRequest
} from "./types.js";

export const TENRAI_BASE_URL = "https://api.tenrai.org/v1";

export interface TenraiPageOptions {
  page?: number;
  limit?: number;
  filter?: string;
  signal?: AbortSignal;
}

export interface TenraiSearchOptions {
  page?: number;
  limit?: number;
  sfw?: boolean;
  orderBy?: string;
  sort?: "asc" | "desc";
  type?: string;
  status?: string;
  rating?: string;
  minScore?: number;
  maxScore?: number;
  genres?: string;
  genresExclude?: string;
  producers?: string;
  letter?: string;
  signal?: AbortSignal;
}

export interface TenraiClient {
  searchAnime(query: string, options?: TenraiSearchOptions): Promise<TenraiPage<TenraiAnime>>;
  getAnime(malId: number | string, signal?: AbortSignal): Promise<TenraiAnime>;
  getTopAnime(options?: TenraiPageOptions): Promise<TenraiPage<TenraiAnime>>;
  getSeasonAnime(
    season: AnimeSeason,
    year: number,
    options?: TenraiPageOptions
  ): Promise<TenraiPage<TenraiAnime>>;
  getRecommendations(
    malId: number | string,
    signal?: AbortSignal
  ): Promise<TenraiPage<TenraiAnime>>;
  getAnimeCharacters(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeStaff(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeNews(malId: number | string, options?: TenraiPageOptions): Promise<unknown>;
  getAnimeForum(
    malId: number | string,
    options?: { filter?: string; signal?: AbortSignal }
  ): Promise<unknown>;
  getAnimeVideos(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimePictures(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeStatistics(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeRelations(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeThemes(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeExternal(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeStreaming(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getSeasonArchive(signal?: AbortSignal): Promise<unknown>;
  getCurrentSeason(options?: TenraiPageOptions): Promise<TenraiPage<TenraiAnime>>;
  getUpcomingSeason(options?: TenraiPageOptions): Promise<TenraiPage<TenraiAnime>>;
  getSchedules(options?: TenraiPageOptions & { filter?: string }): Promise<unknown>;
  getRandomAnime(signal?: AbortSignal): Promise<TenraiAnime>;
  getEpisodes(
    malId: number | string,
    options?: { page?: number; signal?: AbortSignal }
  ): Promise<TenraiPage<TenraiEpisode>>;
}

export function createTenraiRequest(): TenraiRequest {
  return (path, params = {}, signal) =>
    requestJson("Tenrai", buildUrl(TENRAI_BASE_URL, path, params), { signal });
}

export function createTenraiClient(request: TenraiRequest = createTenraiRequest()): TenraiClient {
  const animePath = (malId: number | string) => `/anime/${encodeURIComponent(String(malId))}`;
  const animePage = async (path: string, params: TenraiParams, signal?: AbortSignal) =>
    parsePage(await request(path, params, signal), parseAnime);

  return {
    searchAnime: (query, options = {}) =>
      animePage(
        "/anime",
        {
          q: query || undefined,
          page: options.page,
          limit: options.limit,
          sfw: options.sfw,
          order_by: options.orderBy,
          sort: options.sort,
          type: options.type,
          status: options.status,
          rating: options.rating,
          min_score: options.minScore,
          max_score: options.maxScore,
          genres: options.genres,
          genres_exclude: options.genresExclude,
          producers: options.producers,
          letter: options.letter
        },
        options.signal
      ),

    getAnime: async (malId, signal) => {
      const response = await request(`${animePath(malId)}/full`, {}, signal);
      const anime = isRecord(response) ? parseAnime(response.data) : null;
      if (!anime) throw new Error("Invalid Tenrai anime response");
      return anime;
    },

    getTopAnime: (options = {}) =>
      animePage(
        "/top/anime",
        { page: options.page, limit: options.limit, filter: options.filter },
        options.signal
      ),

    getSeasonAnime: (season, year, options = {}) =>
      animePage(
        `/seasons/${year}/${season}`,
        { page: options.page, limit: options.limit, filter: options.filter },
        options.signal
      ),

    getRecommendations: async (malId, signal) =>
      parsePage(
        await request(`${animePath(malId)}/recommendations`, {}, signal),
        parseRecommendation
      ),

    getAnimeCharacters: (malId, signal) => request(`${animePath(malId)}/characters`, {}, signal),
    getAnimeStaff: (malId, signal) => request(`${animePath(malId)}/staff`, {}, signal),
    getAnimeNews: (malId, options = {}) =>
      request(
        `${animePath(malId)}/news`,
        { page: options.page, limit: options.limit },
        options.signal
      ),
    getAnimeForum: (malId, options = {}) =>
      request(`${animePath(malId)}/forum`, { filter: options.filter }, options.signal),
    getAnimeVideos: (malId, signal) => request(`${animePath(malId)}/videos`, {}, signal),
    getAnimePictures: (malId, signal) => request(`${animePath(malId)}/pictures`, {}, signal),
    getAnimeStatistics: (malId, signal) => request(`${animePath(malId)}/statistics`, {}, signal),
    getAnimeRelations: (malId, signal) => request(`${animePath(malId)}/relations`, {}, signal),
    getAnimeThemes: (malId, signal) => request(`${animePath(malId)}/themes`, {}, signal),
    getAnimeExternal: (malId, signal) => request(`${animePath(malId)}/external`, {}, signal),
    getAnimeStreaming: (malId, signal) => request(`${animePath(malId)}/streaming`, {}, signal),

    getSeasonArchive: (signal) => request("/seasons", {}, signal),
    getCurrentSeason: (options = {}) =>
      animePage(
        "/seasons/now",
        { page: options.page, limit: options.limit, filter: options.filter },
        options.signal
      ),
    getUpcomingSeason: (options = {}) =>
      animePage(
        "/seasons/upcoming",
        { page: options.page, limit: options.limit, filter: options.filter },
        options.signal
      ),
    getSchedules: (options = {}) =>
      request(
        `/schedules${options.filter ? `/${encodeURIComponent(options.filter)}` : ""}`,
        { page: options.page, limit: options.limit },
        options.signal
      ),
    getRandomAnime: async (signal) => {
      const response = await request("/random/anime", {}, signal);
      const anime = isRecord(response) ? parseAnime(response.data) : null;
      if (!anime) throw new Error("Invalid Tenrai random anime response");
      return anime;
    },

    getEpisodes: async (malId, options = {}) =>
      parsePage(
        await request(`${animePath(malId)}/episodes`, { page: options.page }, options.signal),
        parseEpisode
      )
  };
}
