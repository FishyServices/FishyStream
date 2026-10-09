import type { MediaType } from "../../shared/media.js";
import {
  collectUniqueCards,
  currentYear,
  deriveAgeRating,
  PLACEHOLDER_POSTER_URL,
  type CollectOptions
} from "../helpers.js";
import { TMDB_GENRE_NAMES } from "./genres.js";
import type { TMDBListItem, TMDBListResponse, TMDBTitleResponse } from "./schema.js";
import type { TMDBContentCard, TMDBItem } from "./types.js";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

type ImageSize = "w185" | "w300" | "w500" | "original";

export function imageUrl(path: string | null | undefined, size: ImageSize): string | undefined {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : undefined;
}

export function posterUrl(path: string | null | undefined): string {
  return imageUrl(path, "w500") ?? PLACEHOLDER_POSTER_URL;
}

export function releaseDate(item: TMDBListItem, type: MediaType): string | undefined {
  return type === "movie" ? item.release_date : item.first_air_date;
}

export function releaseYear(item: TMDBListItem, type: MediaType): number {
  return Number(releaseDate(item, type)?.slice(0, 4)) || currentYear();
}

export function itemTitle(item: TMDBListItem, type: MediaType): string {
  return (type === "movie" ? item.title : item.name) ?? "";
}

export function itemGenres(item: TMDBListItem): string[] {
  const names = item.genres?.length
    ? item.genres.map((genre) => genre.name ?? TMDB_GENRE_NAMES[genre.id ?? -1])
    : (item.genre_ids ?? []).map((id) => TMDB_GENRE_NAMES[id]);
  return names.filter((name): name is string => !!name);
}

export function toItem(item: TMDBListItem, type: MediaType): TMDBItem {
  return {
    tmdbId: item.id,
    type,
    title: itemTitle(item, type),
    posterUrl: posterUrl(item.poster_path),
    year: releaseYear(item, type),
    genre: itemGenres(item),
    rating: deriveAgeRating(item.vote_average),
    voteAverage: item.vote_average
  };
}

export function toContentCard(item: TMDBListItem, type?: MediaType): TMDBContentCard | null {
  const resolved =
    type ?? (item.media_type === "movie" || item.media_type === "tv" ? item.media_type : undefined);
  if (!resolved || !item.poster_path) return null;
  const title = itemTitle(item, resolved);
  if (!title) return null;
  return {
    tmdbId: String(item.id),
    type: resolved,
    title,
    year: releaseYear(item, resolved),
    posterUrl: posterUrl(item.poster_path),
    voteAverage: item.vote_average,
    genre: itemGenres(item),
    isNew: false,
    releaseDate: releaseDate(item, resolved),
    popularity: item.popularity
  };
}

export function collectContentCards(
  responses: ReadonlyArray<{ data: TMDBListResponse; type?: MediaType }>,
  options?: CollectOptions
): TMDBContentCard[] {
  const cards = responses.flatMap(({ data, type }) =>
    (data.results ?? []).flatMap((item) => toContentCard(item, type) ?? [])
  );
  return collectUniqueCards(cards, (card) => card.tmdbId, options);
}

export function readCertification(title: TMDBTitleResponse, type: MediaType): string | undefined {
  if (type === "tv") {
    return title.content_ratings?.results?.find(
      (entry) => entry.iso_3166_1 === "US" && entry.rating
    )?.rating;
  }
  return title.release_dates?.results
    ?.find((entry) => entry.iso_3166_1 === "US")
    ?.release_dates?.find((entry) => entry.certification)?.certification;
}
