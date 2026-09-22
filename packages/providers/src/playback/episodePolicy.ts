import {
  getCanonicalSeasonCount,
  getCanonicalSeasonEpisodeCount
} from "../anime/tvSeasonMappings.js";

export interface AnimeContentLike {
  type: "movie" | "tv";
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

export function isAnimeProviderContent(content: AnimeContentLike) {
  if (content.type !== "tv") return false;

  const genres = new Set((content.genre ?? []).map((genre) => genre.toLowerCase()));
  return genres.has("animation");
}

export function shouldWaitForAnimeSeasonMetadata(args: {
  contentType: "movie" | "tv";
  isAnime: boolean;
  seasonNumber: number;
  currentSeasonData: Pick<AnimeSeasonMetadataLike, "seasonNumber"> | null | undefined;
}) {
  const { contentType, isAnime, seasonNumber, currentSeasonData } = args;
  if (!isAnime || contentType !== "tv") return false;
  if (seasonNumber <= 1) return false;
  if (currentSeasonData === undefined) return true;
  return currentSeasonData?.seasonNumber !== seasonNumber;
}

export function hasAnimeEpisodeMappingMetadata(
  currentSeasonData:
    | Pick<
        AnimeSeasonMetadataLike,
        "episodeCount" | "anilistEpisodeMappings" | "anilistEpisodeMappingCount"
      >
    | null
    | undefined
) {
  if (currentSeasonData?.anilistEpisodeMappings?.length) return true;
  if (!currentSeasonData?.episodeCount) return false;
  return (
    (currentSeasonData.anilistEpisodeMappingCount ??
      currentSeasonData.anilistEpisodeMappings?.length ??
      0) >= currentSeasonData.episodeCount
  );
}

export function getSeasonYear(airDate?: string) {
  const year = Number((airDate ?? "").split("-")[0]);
  return Number.isFinite(year) && year > 1900 ? year : undefined;
}

export function getNextEpisodeAddress({
  tmdbId,
  currentSeason,
  currentEpisode,
  fallbackSeasonCount,
  currentSeasonEpisodeCount
}: NextEpisodeArgs) {
  const totalSeasons = getCanonicalSeasonCount(tmdbId, fallbackSeasonCount);
  const canonicalEpisodeCount = getCanonicalSeasonEpisodeCount(tmdbId, currentSeason) ?? 0;
  const maxEpisodes = Math.max(currentSeasonEpisodeCount ?? 0, canonicalEpisodeCount) || 999;

  let season = currentSeason;
  let episode = currentEpisode + 1;

  if (currentEpisode >= maxEpisodes) {
    season = currentSeason + 1;
    episode = 1;
  }

  if (season > totalSeasons) return null;
  return { season, episode };
}

export function hasNextEpisode(args: NextEpisodeArgs) {
  return getNextEpisodeAddress(args) !== null;
}
