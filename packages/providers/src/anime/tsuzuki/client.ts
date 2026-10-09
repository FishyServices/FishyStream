import { isRecord, numberOrNull, stringOrNull } from "../../shared/guards.js";
import { buildUrl, requestJson } from "../../shared/http.js";
import type { AnimeSeason } from "../types.js";
import type {
  TsuzukiAirType,
  TsuzukiPayload,
  TsuzukiRequest,
  TsuzukiSchedule,
  TsuzukiScheduleEpisode
} from "./types.js";

export const TSUZUKI_BASE_URL = "https://tsuzuki.top/api/v1";

const DEFAULT_ATTRIBUTION = "Data from AniList, corrected by Tsuzuki.";
const AIR_TYPES: ReadonlySet<unknown> = new Set<TsuzukiAirType>(["raw", "sub", "dub"]);

export interface TsuzukiScheduleOptions {
  start?: string;
  days?: number;
  airType?: TsuzukiAirType;
  platform?: string;
  format?: string;
  includeAdult?: boolean;
  signal?: AbortSignal;
}

export interface TsuzukiClient {
  getServiceInfo(signal?: AbortSignal): Promise<TsuzukiPayload>;
  getOverrides(signal?: AbortSignal): Promise<TsuzukiPayload>;
  getSchedule(options?: TsuzukiScheduleOptions): Promise<TsuzukiSchedule>;
  searchAnime(
    query: string,
    options?: { limit?: number; full?: boolean; signal?: AbortSignal }
  ): Promise<TsuzukiPayload>;
  getAnime(
    anilistId: number | string,
    options?: { full?: boolean; signal?: AbortSignal }
  ): Promise<TsuzukiPayload>;
  getSeason(
    season: AnimeSeason,
    year: number,
    options?: { full?: boolean; signal?: AbortSignal }
  ): Promise<TsuzukiPayload>;
  getAiring(options?: { full?: boolean; signal?: AbortSignal }): Promise<TsuzukiPayload>;
  getFranchise(anilistId: number | string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getShow(anilistId: number | string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getSimilar(anilistId: number | string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getRecommendations(anilistId: number | string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getOnThisDay(day: string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getGems(options?: {
    genres?: string;
    ceiling?: number;
    signal?: AbortSignal;
  }): Promise<TsuzukiPayload>;
  getUnderseen(options?: { ceiling?: number; signal?: AbortSignal }): Promise<TsuzukiPayload>;
  getTags(signal?: AbortSignal): Promise<TsuzukiPayload>;
  getTag(options: {
    name: string;
    sort?: "popular" | "score" | "newest" | "trending";
    page?: number;
    includeAdult?: boolean;
    signal?: AbortSignal;
  }): Promise<TsuzukiPayload>;
  getStudios(query?: string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getStudio(studioId: number | string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getStudioCatalog(
    studioId: number | string,
    page?: number,
    signal?: AbortSignal
  ): Promise<TsuzukiPayload>;
  getStaff(query?: string, signal?: AbortSignal): Promise<TsuzukiPayload>;
  getStaffDetails(
    staffId: number | string,
    page?: number,
    signal?: AbortSignal
  ): Promise<TsuzukiPayload>;
  filter(options?: TsuzukiFilterOptions): Promise<TsuzukiPayload>;
}

export interface TsuzukiFilterOptions {
  genres?: string;
  formats?: string;
  status?: "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";
  from?: string;
  to?: string;
  minScore?: number;
  includeAdult?: boolean;
  signal?: AbortSignal;
}

export function createTsuzukiRequest(): TsuzukiRequest {
  return (path, params = {}, signal) =>
    requestJson("Tsuzuki", buildUrl(TSUZUKI_BASE_URL, path, params), { signal });
}

function parseOk(value: unknown): TsuzukiPayload {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error(
      isRecord(value) && typeof value.error === "string" ? value.error : "Invalid Tsuzuki response"
    );
  }
  return value;
}

function parseScheduleEpisode(item: unknown): TsuzukiScheduleEpisode | null {
  if (
    !isRecord(item) ||
    typeof item.mediaId !== "number" ||
    typeof item.episode !== "number" ||
    !AIR_TYPES.has(item.airType)
  ) {
    return null;
  }
  return {
    mediaId: item.mediaId,
    episode: item.episode,
    airType: item.airType as TsuzukiAirType,
    airingAt: numberOrNull(item.airingAt),
    airingAtIso: stringOrNull(item.airingAtIso),
    exact: item.exact === true,
    estimated: item.estimated === true,
    platform: stringOrNull(item.platform),
    isBreak: item.isBreak === true,
    title: typeof item.title === "string" ? item.title : "",
    coverImage: stringOrNull(item.coverImage)
  };
}

const flag = (enabled?: boolean) => (enabled ? 1 : undefined);

export function createTsuzukiClient(
  request: TsuzukiRequest = createTsuzukiRequest()
): TsuzukiClient {
  const fetchPayload = async (
    path: string,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal
  ) => parseOk(await request(path, params, signal));
  const idPath = (id: number | string) => encodeURIComponent(String(id));

  return {
    getServiceInfo: (signal) => fetchPayload("", {}, signal),
    getOverrides: (signal) => fetchPayload("/overrides", {}, signal),
    getSchedule: async (options = {}) => {
      const payload = await fetchPayload(
        "/schedule",
        {
          start: options.start,
          days: options.days,
          airType: options.airType,
          platform: options.platform,
          format: options.format,
          includeAdult: flag(options.includeAdult)
        },
        options.signal
      );
      if (!Array.isArray(payload.episodes)) throw new Error("Invalid Tsuzuki schedule response");
      const episodes = payload.episodes.flatMap((item) => parseScheduleEpisode(item) ?? []);
      return {
        ok: true,
        count: typeof payload.count === "number" ? payload.count : episodes.length,
        episodes,
        attribution:
          typeof payload.attribution === "string" ? payload.attribution : DEFAULT_ATTRIBUTION
      };
    },
    searchAnime: (query, options = {}) =>
      fetchPayload(
        "/search",
        { q: query, limit: options.limit, full: flag(options.full) },
        options.signal
      ),
    getAnime: (anilistId, options = {}) =>
      fetchPayload(`/anime/${idPath(anilistId)}`, { full: flag(options.full) }, options.signal),
    getSeason: (season, year, options = {}) =>
      fetchPayload(`/seasons/${season}/${year}`, { full: flag(options.full) }, options.signal),
    getAiring: (options = {}) =>
      fetchPayload("/airing", { full: flag(options.full) }, options.signal),
    getFranchise: (anilistId, signal) =>
      fetchPayload(`/franchise/${idPath(anilistId)}`, {}, signal),
    getShow: (anilistId, signal) => fetchPayload(`/show/${idPath(anilistId)}`, {}, signal),
    getSimilar: (anilistId, signal) => fetchPayload(`/similar/${idPath(anilistId)}`, {}, signal),
    getRecommendations: (anilistId, signal) =>
      fetchPayload(`/anime/${idPath(anilistId)}/extras`, {}, signal),
    getOnThisDay: (day, signal) => fetchPayload("/on-this-day", { d: day }, signal),
    getGems: (options = {}) =>
      fetchPayload("/gems", { genres: options.genres, ceil: options.ceiling }, options.signal),
    getUnderseen: (options = {}) =>
      fetchPayload("/underseen", { ceil: options.ceiling }, options.signal),
    getTags: (signal) => fetchPayload("/tags", {}, signal),
    getTag: (options) =>
      fetchPayload(
        "/tag",
        {
          name: options.name,
          sort: options.sort,
          page: options.page,
          adult: flag(options.includeAdult)
        },
        options.signal
      ),
    getStudios: (query, signal) => fetchPayload("/studios", { q: query }, signal),
    getStudio: (studioId, signal) => fetchPayload(`/studio/${idPath(studioId)}`, {}, signal),
    getStudioCatalog: (studioId, page, signal) =>
      fetchPayload(`/studio/${idPath(studioId)}/catalog`, { page }, signal),
    getStaff: (query, signal) => fetchPayload("/staff", { q: query }, signal),
    getStaffDetails: (staffId, page, signal) =>
      fetchPayload(`/staff/${idPath(staffId)}`, { page }, signal),
    filter: (options = {}) =>
      fetchPayload(
        "/filter",
        {
          genres: options.genres,
          formats: options.formats,
          status: options.status,
          from: options.from,
          to: options.to,
          minScore: options.minScore,
          adult: flag(options.includeAdult)
        },
        options.signal
      )
  };
}
