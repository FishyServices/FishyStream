import { parseContentId, type ContentId } from "@content/contentMetadata";
import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

const RATINGS_KEY = "fishystream:catalog:ratings";
const MAX_CACHED_TITLE_RATINGS = 500;
const MAX_CACHED_EPISODE_SEASONS = 100;

export type CachedEpisodeRating = {
  episodeNumber: number;
  name: string;
  voteAverage: number;
};

type RatingsCache = {
  version: 1;
  titles: Record<string, number>;
  episodes: Record<string, CachedEpisodeRating[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEpisodeRating(value: unknown): value is CachedEpisodeRating {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.episodeNumber) &&
    (value.episodeNumber as number) > 0 &&
    typeof value.name === "string" &&
    typeof value.voteAverage === "number" &&
    Number.isFinite(value.voteAverage) &&
    value.voteAverage >= 0 &&
    value.voteAverage <= 10
  );
}

function emptyRatingsCache(): RatingsCache {
  return { version: 1, titles: {}, episodes: {} };
}

function readRatingsCache(): RatingsCache {
  try {
    const raw = getLocalStorageItem(RATINGS_KEY);
    if (!raw) return emptyRatingsCache();
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return emptyRatingsCache();

    const titles = isRecord(value.titles)
      ? Object.fromEntries(
          Object.entries(value.titles).filter(
            (entry): entry is [ContentId, number] =>
              parseContentId(entry[0]) !== null &&
              typeof entry[1] === "number" &&
              Number.isFinite(entry[1]) &&
              entry[1] > 0 &&
              entry[1] <= 10
          )
        )
      : {};
    const episodes = isRecord(value.episodes)
      ? Object.fromEntries(
          Object.entries(value.episodes).filter(
            (entry): entry is [string, CachedEpisodeRating[]] =>
              Array.isArray(entry[1]) && entry[1].length > 0 && entry[1].every(isEpisodeRating)
          )
        )
      : {};

    return { version: 1, titles, episodes };
  } catch {
    return emptyRatingsCache();
  }
}

function writeRatingsCache(cache: RatingsCache): void {
  try {
    setLocalStorageItem(RATINGS_KEY, JSON.stringify(cache));
  } catch {}
}

export function readTitleRating(contentId: ContentId): number | undefined {
  return readRatingsCache().titles[contentId];
}

export function writeTitleRating(contentId: ContentId, rating: number): void {
  if (parseContentId(contentId) === null || !Number.isFinite(rating) || rating <= 0 || rating > 10)
    return;

  const cache = readRatingsCache();
  delete cache.titles[contentId];
  cache.titles[contentId] = rating;
  cache.titles = Object.fromEntries(Object.entries(cache.titles).slice(-MAX_CACHED_TITLE_RATINGS));
  writeRatingsCache(cache);
}

function episodeRatingsKey(imdbId: string, seasonNumber: number): string {
  return `${imdbId}:${seasonNumber}`;
}

export function readEpisodeRatings(
  imdbId: string,
  seasonNumber: number
): CachedEpisodeRating[] | null {
  return readRatingsCache().episodes[episodeRatingsKey(imdbId, seasonNumber)] ?? null;
}

export function writeEpisodeRatings(
  imdbId: string,
  seasonNumber: number,
  episodes: CachedEpisodeRating[]
): void {
  if (!episodes.length) return;

  const cache = readRatingsCache();
  const key = episodeRatingsKey(imdbId, seasonNumber);
  delete cache.episodes[key];
  cache.episodes[key] = episodes;
  cache.episodes = Object.fromEntries(
    Object.entries(cache.episodes).slice(-MAX_CACHED_EPISODE_SEASONS)
  );
  writeRatingsCache(cache);
}
