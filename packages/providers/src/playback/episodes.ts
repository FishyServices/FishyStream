import type { MediaType } from "../shared/media.js";
import { getCanonicalSeasonCount, getCanonicalSeasonEpisodeCount } from "../ordering/index.js";

const UNKNOWN_EPISODE_LIMIT = 999;
const MIN_VALID_YEAR = 1900;

export interface AnimeContentLike {
  type: MediaType;
  genre?: string[];
  originalLanguage?: string;
}

export interface AnimeSeasonMetadataLike {
  seasonNumber: number;
  episodeCount?: number;
  anilistId?: string;
  anilistEpisodeMappings?: Array<{ episodeNumber: number }>;
  anilistEpisodeMappingCount?: number;
}

export interface NextEpisodeArgs {
  tmdbId?: string | number | null;
  currentSeason: number;
  currentEpisode: number;
  fallbackSeasonCount?: number | null;
  currentSeasonEpisodeCount?: number | null;
}

export function isAnimeProviderContent(content: AnimeContentLike): boolean {
  return (content.genre ?? []).some((genre) => genre.toLowerCase() === "animation");
}

export function shouldWaitForAnimeSeasonMetadata(args: {
  contentType: MediaType;
  isAnime: boolean;
  seasonNumber: number;
  currentSeasonData: Pick<AnimeSeasonMetadataLike, "seasonNumber"> | null | undefined;
}): boolean {
  const { contentType, isAnime, seasonNumber, currentSeasonData } = args;
  if (!isAnime || contentType !== "tv" || seasonNumber <= 1) return false;
  return currentSeasonData?.seasonNumber !== seasonNumber;
}

export function hasAnimeEpisodeMappingMetadata(
  seasonData:
    | Pick<
        AnimeSeasonMetadataLike,
        "episodeCount" | "anilistEpisodeMappings" | "anilistEpisodeMappingCount"
      >
    | null
    | undefined
): boolean {
  if (seasonData?.anilistEpisodeMappings?.length) return true;
  if (!seasonData?.episodeCount) return false;
  const mapped =
    seasonData.anilistEpisodeMappingCount ?? seasonData.anilistEpisodeMappings?.length ?? 0;
  return mapped >= seasonData.episodeCount;
}

export function getSeasonYear(airDate?: string): number | undefined {
  const year = Number((airDate ?? "").split("-")[0]);
  return Number.isFinite(year) && year > MIN_VALID_YEAR ? year : undefined;
}

export function getNextEpisodeAddress(
  args: NextEpisodeArgs
): { season: number; episode: number } | null {
  const { tmdbId, currentSeason, currentEpisode, fallbackSeasonCount, currentSeasonEpisodeCount } =
    args;
  const totalSeasons = getCanonicalSeasonCount(tmdbId, fallbackSeasonCount);
  const canonicalCount = getCanonicalSeasonEpisodeCount(tmdbId, currentSeason) ?? 0;
  const maxEpisodes =
    Math.max(currentSeasonEpisodeCount ?? 0, canonicalCount) || UNKNOWN_EPISODE_LIMIT;

  const next =
    currentEpisode >= maxEpisodes
      ? { season: currentSeason + 1, episode: 1 }
      : { season: currentSeason, episode: currentEpisode + 1 };
  return next.season > totalSeasons ? null : next;
}

export function hasNextEpisode(args: NextEpisodeArgs): boolean {
  return getNextEpisodeAddress(args) !== null;
}
