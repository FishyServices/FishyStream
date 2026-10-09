import { buildUrl, requestJson } from "../../shared/http.js";
import type { TMDBRequest } from "./types.js";

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const DEFAULT_TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";

export function createTMDBRequest(apiKey: string = DEFAULT_TMDB_API_KEY): TMDBRequest {
  return (path, params, signal) =>
    requestJson(
      "TMDB",
      buildUrl(TMDB_BASE_URL, path, { api_key: apiKey, language: "en-US", ...params }),
      { signal }
    );
}
