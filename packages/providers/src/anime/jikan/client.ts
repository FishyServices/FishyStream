import { isRecord } from "../../shared/guards.js";
import { buildUrl, requestJson } from "../../shared/http.js";
import type { AnimeSeason } from "../types.js";
import { parseAnime, parseEpisode, parsePage, parseRecommendation } from "./parse.js";
import type { JikanAnime, JikanEpisode, JikanPage, JikanParams, JikanRequest } from "./types.js";

export const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

export interface JikanPageOptions {
  page?: number;
  limit?: number;
  filter?: string;
  signal?: AbortSignal;
}

export interface JikanSearchOptions {
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

export interface JikanClient {
  searchAnime(query: string, options?: JikanSearchOptions): Promise<JikanPage<JikanAnime>>;
  getAnime(malId: number | string, signal?: AbortSignal): Promise<JikanAnime>;
  getTopAnime(options?: JikanPageOptions): Promise<JikanPage<JikanAnime>>;
  getSeasonAnime(
    season: AnimeSeason,
    year: number,
    options?: JikanPageOptions
  ): Promise<JikanPage<JikanAnime>>;
  getRecommendations(malId: number | string, signal?: AbortSignal): Promise<JikanPage<JikanAnime>>;
  getAnimeCharacters(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeStaff(malId: number | string, signal?: AbortSignal): Promise<unknown>;
  getAnimeNews(malId: number | string, options?: JikanPageOptions): Promise<unknown>;
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
  getCurrentSeason(options?: JikanPageOptions): Promise<JikanPage<JikanAnime>>;
  getUpcomingSeason(options?: JikanPageOptions): Promise<JikanPage<JikanAnime>>;
  getSchedules(options?: JikanPageOptions & { filter?: string }): Promise<unknown>;
  getRandomAnime(signal?: AbortSignal): Promise<JikanAnime>;
  getEpisodes(
    malId: number | string,
    options?: { page?: number; signal?: AbortSignal }
  ): Promise<JikanPage<JikanEpisode>>;
}

export function createJikanRequest(): JikanRequest {
  return (path, params = {}, signal) =>
    requestJson("Jikan", buildUrl(JIKAN_BASE_URL, path, params), { signal });
}

export function createJikanClient(request: JikanRequest = createJikanRequest()): JikanClient {
  const animePath = (malId: number | string) => `/anime/${encodeURIComponent(String(malId))}`;
  const animePage = async (path: string, params: JikanParams, signal?: AbortSignal) =>
    parsePage(await request(path, params, signal), parseAnime);

  return {
    searchAnime: (query, options = {}) =>
      animePage(
        "/anime",
        {
          q: query,
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
      if (!anime) throw new Error("Invalid Jikan anime response");
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
      if (!anime) throw new Error("Invalid Jikan random anime response");
      return anime;
    },

    getEpisodes: async (malId, options = {}) =>
      parsePage(
        await request(`${animePath(malId)}/episodes`, { page: options.page }, options.signal),
        parseEpisode
      )
  };
}
