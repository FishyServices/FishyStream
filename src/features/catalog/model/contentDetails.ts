import { makeContentId, type ContentDetail, type ContentId } from "@content/contentMetadata";
import type { TMDBFullDetail } from "@fishy/providers/tmdb";

export function contentDetailFromTmdb(
  detail: TMDBFullDetail,
  id: ContentId = makeContentId(detail.type, detail.tmdbId)
): ContentDetail {
  return {
    _id: id,
    title: detail.title,
    type: detail.type,
    year: detail.year,
    posterUrl: detail.posterUrl,
    backdropUrl: detail.backdropUrl,
    description: detail.description,
    rating: detail.rating,
    voteAverage: detail.voteAverage,
    genre: detail.genre,
    tmdbId: detail.tmdbId,
    logoUrl: detail.logoUrl,
    trailerKey: detail.trailerKey,
    duration: detail.duration,
    seasons: detail.seasons,
    hasSpecials: detail.hasSpecials,
    tagline: detail.tagline,
    originalLanguage: detail.originalLanguage,
    imdbId: detail.imdbId,
    totalEpisodes: detail.totalEpisodes,
    status: detail.status,
    trending: detail.trending,
    new: detail.isNew
  };
}
