import { isRecord, numberOrNull, stringOrNull } from "../../shared/guards.js";
import type { JikanAnime, JikanEpisode, JikanPage } from "./types.js";

export function parsePage<T>(value: unknown, parseItem: (item: unknown) => T | null): JikanPage<T> {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) {
    throw new Error("Invalid Jikan response");
  }
  const { last_visible_page, has_next_page } = value.pagination;
  if (typeof last_visible_page !== "number" || typeof has_next_page !== "boolean") {
    throw new Error("Invalid Jikan pagination response");
  }
  return {
    data: value.data.flatMap((item) => parseItem(item) ?? []),
    pagination: { last_visible_page, has_next_page }
  };
}

export function parseAnime(value: unknown): JikanAnime | null {
  if (!isRecord(value)) return null;
  const { mal_id, title, url } = value;
  if (typeof mal_id !== "number" || typeof title !== "string" || typeof url !== "string") {
    return null;
  }
  const jpg = isRecord(value.images) && isRecord(value.images.jpg) ? value.images.jpg : undefined;
  const aired = isRecord(value.aired) ? value.aired : undefined;
  return {
    mal_id,
    url,
    title,
    images: jpg
      ? {
          jpg: {
            image_url: stringOrNull(jpg.image_url),
            large_image_url: stringOrNull(jpg.large_image_url)
          }
        }
      : undefined,
    title_english: stringOrNull(value.title_english),
    title_japanese: stringOrNull(value.title_japanese),
    type: stringOrNull(value.type),
    episodes: numberOrNull(value.episodes),
    status: stringOrNull(value.status),
    airing: value.airing === true,
    aired: aired ? { from: stringOrNull(aired.from), to: stringOrNull(aired.to) } : undefined,
    duration: stringOrNull(value.duration),
    rating: stringOrNull(value.rating),
    score: numberOrNull(value.score),
    scored_by: numberOrNull(value.scored_by),
    synopsis: stringOrNull(value.synopsis),
    year: numberOrNull(value.year),
    genres: Array.isArray(value.genres)
      ? value.genres.flatMap((genre) =>
          isRecord(genre) && typeof genre.name === "string" ? [{ name: genre.name }] : []
        )
      : undefined,
    season: stringOrNull(value.season)
  };
}

export function parseEpisode(value: unknown): JikanEpisode | null {
  if (!isRecord(value) || typeof value.mal_id !== "number" || typeof value.title !== "string") {
    return null;
  }
  return {
    mal_id: value.mal_id,
    title: value.title,
    title_japanese: stringOrNull(value.title_japanese),
    title_romaji: stringOrNull(value.title_romanji),
    aired: stringOrNull(value.aired),
    score: numberOrNull(value.score),
    filler: value.filler === true,
    recap: value.recap === true
  };
}

export function parseRecommendation(value: unknown): JikanAnime | null {
  return isRecord(value) ? parseAnime(value.entry) : null;
}
