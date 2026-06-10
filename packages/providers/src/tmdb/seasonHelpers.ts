import { getPosterUrl, getStillUrl } from "./imageHelpers";
import { getYear } from "./metadataHelpers";
import type { TMDBSeasonDetails, CanonicalSeasonPayload, CompactEpisode } from "./types";

export function mapTmdbSeasonToCanonicalPayload(
  data: TMDBSeasonDetails,
  seasonNumber: number
): CanonicalSeasonPayload {
  return {
    seasonNumber,
    name: data.name,
    overview: data.overview || undefined,
    posterUrl: data.poster_path ? getPosterUrl(data.poster_path) : undefined,
    airDate: data.air_date ?? undefined,
    episodeCount: data.episodes?.length ?? 0,
    year: getYear(data.air_date ?? undefined),
    episodes: (data.episodes ?? []).map((ep) => ({
      episodeNumber: ep.episode_number,
      name: ep.name,
      overview: ep.overview || undefined,
      stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
      airDate: ep.air_date ?? undefined,
      runtime: ep.runtime ?? undefined,
      voteAverage: ep.vote_average
    }))
  };
}

export function compactSeasonEpisodesForDb(
  episodes: CanonicalSeasonPayload["episodes"]
): CompactEpisode[] {
  return episodes.map((ep) => ({
    episodeNumber: ep.episodeNumber,
    name: ep.name,
    stillUrl: ep.stillUrl,
    runtime: ep.runtime,
    voteAverage: ep.voteAverage
  }));
}

export function hasEpisodes(data: TMDBSeasonDetails | null): data is TMDBSeasonDetails {
  return (data?.episodes?.length ?? 0) > 0;
}
