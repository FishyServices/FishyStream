import { isRecord } from "../../shared/guards.js";
import { buildUrl, HttpError, requestJson, type Fetcher } from "../../shared/http.js";
import type {
  AnimeScheduleAirType,
  AnimeScheduleEpisode,
  AnimeScheduleRequest,
  AnimeScheduleTitle
} from "./types.js";

export const ANIME_SCHEDULE_BASE_URL = "https://animeschedule.net/api/v3";

export interface AnimeScheduleClient {
  searchAnime(query: string, signal?: AbortSignal): Promise<AnimeScheduleTitle[]>;
  getTimetable(
    airType: AnimeScheduleAirType,
    options: { year: number; week: number; timeZone?: string; signal?: AbortSignal }
  ): Promise<AnimeScheduleEpisode[]>;
}

export function createAnimeScheduleRequest(token: string, fetcher?: Fetcher): AnimeScheduleRequest {
  if (!token.trim()) throw new Error("AnimeSchedule API token is required");
  return (path, params = {}, signal) =>
    requestJson("AnimeSchedule", buildUrl(ANIME_SCHEDULE_BASE_URL, path, params), {
      signal,
      fetcher,
      headers: { Authorization: `Bearer ${token}` }
    });
}

function arrayFromResponse(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key] as unknown[];
  }
  return [];
}

function parseAnime(value: unknown): AnimeScheduleTitle | null {
  if (!isRecord(value) || typeof value.route !== "string") return null;
  const names = isRecord(value.names) ? value.names : {};
  const websites = isRecord(value.websites) ? value.websites : {};
  const mediaTypes = Array.isArray(value.mediaTypes) ? value.mediaTypes : [];
  const title =
    typeof value.title === "string" ? value.title : String(names.english ?? names.romaji ?? "");
  if (!title) return null;
  return {
    id: typeof value.id === "string" ? value.id : value.route,
    title,
    route: value.route,
    names: {
      english: typeof names.english === "string" ? names.english : undefined,
      romaji: typeof names.romaji === "string" ? names.romaji : undefined,
      native: typeof names.native === "string" ? names.native : undefined,
      synonyms: Array.isArray(names.synonyms)
        ? names.synonyms.filter((name): name is string => typeof name === "string")
        : undefined
    },
    format: typeof value.format === "string" ? value.format : undefined,
    episodes: typeof value.episodes === "number" ? value.episodes : undefined,
    websites: {
      aniList: typeof websites.aniList === "string" ? websites.aniList : undefined,
      mal: typeof websites.mal === "string" ? websites.mal : undefined
    },
    mediaTypes: mediaTypes.flatMap((entry) =>
      isRecord(entry)
        ? [
            {
              name: typeof entry.name === "string" ? entry.name : undefined,
              route: typeof entry.route === "string" ? entry.route : undefined
            }
          ]
        : []
    )
  };
}

function parseEpisode(
  value: unknown,
  fallbackAirType: AnimeScheduleAirType
): AnimeScheduleEpisode | null {
  if (!isRecord(value) || typeof value.route !== "string" || typeof value.episodeDate !== "string")
    return null;
  return {
    route: value.route,
    title: typeof value.title === "string" ? value.title : "",
    english: typeof value.english === "string" ? value.english : undefined,
    romaji: typeof value.romaji === "string" ? value.romaji : undefined,
    episodeDate: value.episodeDate,
    episodeNumber: typeof value.episodeNumber === "number" ? value.episodeNumber : 0,
    airType:
      value.airType === "raw" || value.airType === "sub" || value.airType === "dub"
        ? value.airType
        : fallbackAirType,
    airingStatus: typeof value.airingStatus === "string" ? value.airingStatus : undefined,
    platform: typeof value.platform === "string" ? value.platform : undefined,
    estimated: value.estimated === true
  };
}

export function createAnimeScheduleClient(request: AnimeScheduleRequest): AnimeScheduleClient {
  return {
    async searchAnime(query, signal) {
      const payload = await request("/anime", { q: query, page: 1, st: "popularity" }, signal);
      return arrayFromResponse(payload, ["anime", "results", "items", "data"])
        .map(parseAnime)
        .filter((anime): anime is AnimeScheduleTitle => anime !== null);
    },
    async getTimetable(airType, options) {
      let payload: unknown;
      try {
        payload = await request(
          `/timetables/${airType}`,
          {
            year: options.year,
            week: options.week,
            tz: options.timeZone ?? "UTC"
          },
          options.signal
        );
      } catch (error) {
        if (error instanceof HttpError && error.service === "AnimeSchedule" && error.status === 404)
          return [];
        throw error;
      }
      return arrayFromResponse(payload, ["anime", "timetable", "results", "items", "data"])
        .map((item) => parseEpisode(item, airType))
        .filter((episode): episode is AnimeScheduleEpisode => episode !== null);
    }
  };
}
