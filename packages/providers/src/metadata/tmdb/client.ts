import { recover } from "../../shared/async.js";
import type { MediaType } from "../../shared/media.js";
import { deriveAgeRating, formatDuration } from "../helpers.js";
import type { EpisodePage, MetadataClient, Rating, Title, TitleReference } from "../types.js";
import {
  imageUrl,
  itemGenres,
  itemTitle,
  posterUrl,
  readCertification,
  releaseDate,
  releaseYear,
  toContentCard,
  toItem
} from "./mappers.js";
import { createTMDBRequest } from "./request.js";
import type {
  TMDBCreditsResponse,
  TMDBFindResponse,
  TMDBListResponse,
  TMDBSeasonResponse,
  TMDBTitleResponse,
  TMDBVideosResponse
} from "./schema.js";
import type {
  TMDBCanonicalSeason,
  TMDBContentCard,
  TMDBCreditResult,
  TMDBDetailsResult,
  TMDBDiscoverOptions,
  TMDBDiscoverResult,
  TMDBFullDetail,
  TMDBId,
  TMDBItem,
  TMDBParams,
  TMDBRequest,
  TMDBSearchOptions,
  TMDBSearchResult,
  TMDBSeasonDetail,
  TMDBVideoResult
} from "./types.js";

const DEFAULT_MIN_VOTE_COUNT = 25;
const MAX_CAST_MEMBERS = 20;
const TRAILER_TYPES: ReadonlySet<string> = new Set(["Trailer", "Teaser"]);

export interface TMDBClient extends MetadataClient {
  list(path: string, params?: TMDBParams, signal?: AbortSignal): Promise<TMDBListResponse>;
  popular(type: MediaType, signal?: AbortSignal): Promise<TMDBListResponse>;
  nowPlaying(signal?: AbortSignal): Promise<TMDBListResponse>;
  search(query: string, type: MediaType, options?: TMDBSearchOptions): Promise<TMDBSearchResult>;
  searchAll(
    query: string,
    options?: TMDBSearchOptions
  ): Promise<{ movies: TMDBSearchResult; shows: TMDBSearchResult }>;
  discover(type: MediaType, options?: TMDBDiscoverOptions): Promise<TMDBDiscoverResult>;
  findByImdbId(imdbId: string, type: MediaType, signal?: AbortSignal): Promise<string | null>;
  fullDetail(id: TMDBId, type: MediaType, signal?: AbortSignal): Promise<TMDBFullDetail | null>;
  cardDetail(id: TMDBId, type: MediaType, signal?: AbortSignal): Promise<TMDBContentCard | null>;
  details(id: TMDBId, type: MediaType, signal?: AbortSignal): Promise<TMDBDetailsResult | null>;
  related(id: TMDBId, type: MediaType, limit?: number, signal?: AbortSignal): Promise<TMDBItem[]>;
  credits(id: TMDBId, type: MediaType, signal?: AbortSignal): Promise<TMDBCreditResult | null>;
  videos(id: TMDBId, type: MediaType, signal?: AbortSignal): Promise<TMDBVideoResult[]>;
  seasonEpisodes(
    id: TMDBId,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<TMDBSeasonDetail | null>;
  canonicalSeason(
    id: TMDBId,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<TMDBCanonicalSeason | null>;
}

function requireType(reference: TitleReference): MediaType {
  if (!reference.type) throw new Error("TMDB references require type");
  return reference.type;
}

function toDetails(detail: TMDBFullDetail): TMDBDetailsResult {
  return {
    description: detail.description,
    backdropUrl: detail.backdropUrl,
    rating: detail.rating,
    duration: detail.duration,
    releaseDate: detail.releaseDate,
    seasons: detail.seasons,
    hasSpecials: detail.hasSpecials,
    tagline: detail.tagline,
    originalLanguage: detail.originalLanguage
  };
}

function toCard(detail: TMDBFullDetail): TMDBContentCard {
  return {
    tmdbId: detail.tmdbId,
    type: detail.type,
    title: detail.title,
    year: detail.year,
    posterUrl: detail.posterUrl,
    voteAverage: detail.voteAverage,
    genre: detail.genre,
    isNew: false
  };
}

export function createTMDBClient(request: TMDBRequest = createTMDBRequest()): TMDBClient {
  const get = <T>(path: string, params: TMDBParams = {}, signal?: AbortSignal) =>
    request(path, params, signal) as Promise<T>;

  const list = (path: string, params: TMDBParams = {}, signal?: AbortSignal) =>
    recover(() => get<TMDBListResponse>(path, params, signal), { results: [] });

  const loadTitle = (id: TMDBId, type: MediaType, signal?: AbortSignal) =>
    recover(
      () =>
        get<TMDBTitleResponse | null>(
          `/${type}/${id}`,
          {
            append_to_response: `external_ids,${type === "tv" ? "content_ratings" : "release_dates"}`
          },
          signal
        ),
      null
    );

  async function getTitle(reference: TitleReference, signal?: AbortSignal): Promise<Title | null> {
    const type = requireType(reference);
    const value = await get<TMDBTitleResponse>(`/${type}/${reference.id}`, {}, signal);
    const title = itemTitle(value, type);
    if (!title) return null;
    return {
      id: reference.id,
      type,
      title,
      rating: { value: value.vote_average ?? 0, voteCount: value.vote_count }
    };
  }

  async function getTitleRating(
    reference: TitleReference,
    signal?: AbortSignal
  ): Promise<Rating | null> {
    return (await getTitle(reference, signal))?.rating ?? null;
  }

  async function getEpisodePage(
    reference: TitleReference,
    signal?: AbortSignal
  ): Promise<EpisodePage> {
    const { seasonNumber } = reference;
    if (reference.type !== "tv" || seasonNumber === undefined) {
      throw new Error("TMDB episode references require TV type and seasonNumber");
    }
    const season = await get<TMDBSeasonResponse>(
      `/tv/${reference.id}/season/${seasonNumber}`,
      {},
      signal
    );
    return {
      episodes: (season.episodes ?? []).map((episode) => ({
        id: String(episode.id),
        type: "tv",
        title: episode.name,
        seasonNumber,
        episodeNumber: episode.episode_number,
        rating: { value: episode.vote_average ?? 0 }
      }))
    };
  }

  async function search(
    query: string,
    type: MediaType,
    options: TMDBSearchOptions = {}
  ): Promise<TMDBSearchResult> {
    const response = await list(
      `/search/${type}`,
      { query, page: options.page ?? 1 },
      options.signal
    );
    return {
      items: (response.results ?? []).map((item) => toItem(item, type)),
      totalPages: response.total_pages ?? 1
    };
  }

  async function searchAll(query: string, options: TMDBSearchOptions = {}) {
    const [movies, shows] = await Promise.all([
      search(query, "movie", options),
      search(query, "tv", options)
    ]);
    return { movies, shows };
  }

  async function discover(
    type: MediaType,
    options: TMDBDiscoverOptions = {}
  ): Promise<TMDBDiscoverResult> {
    const { page = 1, sortBy, genreId, minVoteCount = DEFAULT_MIN_VOTE_COUNT, signal } = options;
    const path = sortBy === "trending" && !genreId ? `/trending/${type}/week` : `/discover/${type}`;
    const response = await list(
      path,
      {
        page,
        with_genres: genreId,
        sort_by: sortBy === "rating" ? "vote_average.desc" : "popularity.desc",
        "vote_count.gte": minVoteCount
      },
      signal
    );
    return {
      items: (response.results ?? []).flatMap((item) => toContentCard(item, type) ?? []),
      totalPages: response.total_pages ?? 1,
      totalResults: response.total_results ?? 0
    };
  }

  async function findByImdbId(
    imdbId: string,
    type: MediaType,
    signal?: AbortSignal
  ): Promise<string | null> {
    const response = await recover(
      () => get<TMDBFindResponse>(`/find/${imdbId}`, { external_source: "imdb_id" }, signal),
      {}
    );
    const match = (type === "tv" ? response.tv_results : response.movie_results)?.[0];
    return match ? String(match.id) : null;
  }

  async function fullDetail(
    id: TMDBId,
    type: MediaType,
    signal?: AbortSignal
  ): Promise<TMDBFullDetail | null> {
    const value = await loadTitle(id, type, signal);
    const title = value ? itemTitle(value, type) : "";
    if (!value || !title) return null;
    const isTv = type === "tv";
    return {
      tmdbId: String(id),
      type,
      title,
      description: value.overview ?? "No description available",
      year: releaseYear(value, type),
      rating: readCertification(value, type) || deriveAgeRating(value.vote_average),
      voteAverage: value.vote_average,
      posterUrl: posterUrl(value.poster_path),
      backdropUrl: imageUrl(value.backdrop_path, "original") ?? "",
      duration: isTv ? undefined : formatDuration(value.runtime),
      releaseDate: releaseDate(value, type),
      seasons: isTv ? value.number_of_seasons : undefined,
      totalEpisodes: isTv ? value.number_of_episodes : undefined,
      hasSpecials: isTv ? value.seasons?.some((season) => season.season_number === 0) : undefined,
      genre: itemGenres(value),
      imdbId: value.imdb_id ?? value.external_ids?.imdb_id ?? undefined,
      originalLanguage: value.original_language,
      tagline: value.tagline || undefined,
      status: value.status || undefined,
      trending: false,
      isNew: false
    };
  }

  async function related(
    id: TMDBId,
    type: MediaType,
    limit = 10,
    signal?: AbortSignal
  ): Promise<TMDBItem[]> {
    const response = await list(`/${type}/${id}/recommendations`, {}, signal);
    return (response.results ?? []).slice(0, limit).map((item) => toItem(item, type));
  }

  async function credits(
    id: TMDBId,
    type: MediaType,
    signal?: AbortSignal
  ): Promise<TMDBCreditResult | null> {
    const response = await recover(
      () => get<TMDBCreditsResponse>(`/${type}/${id}/credits`, {}, signal),
      null
    );
    if (!response) return null;
    return {
      cast: (response.cast ?? []).slice(0, MAX_CAST_MEMBERS).map((actor, index) => ({
        id: actor.id,
        name: actor.name,
        character: actor.character ?? "",
        profileUrl: imageUrl(actor.profile_path, "w185") ?? "",
        order: actor.order ?? index
      })),
      directors: (response.crew ?? [])
        .filter((member) => member.job === "Director")
        .map((member) => member.name)
    };
  }

  async function videos(
    id: TMDBId,
    type: MediaType,
    signal?: AbortSignal
  ): Promise<TMDBVideoResult[]> {
    const response = await recover(
      () => get<TMDBVideosResponse>(`/${type}/${id}/videos`, {}, signal),
      {}
    );
    return (response.results ?? []).flatMap((video) =>
      video.site === "YouTube" &&
      video.key &&
      video.name &&
      video.type &&
      TRAILER_TYPES.has(video.type)
        ? [
            {
              key: video.key,
              name: video.name,
              type: video.type,
              official: video.official === true
            }
          ]
        : []
    );
  }

  async function seasonEpisodes(
    id: TMDBId,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<TMDBSeasonDetail | null> {
    const season = await recover(
      () => get<TMDBSeasonResponse>(`/tv/${id}/season/${seasonNumber}`, {}, signal),
      null
    );
    if (!season) return null;
    return {
      overview: season.overview,
      airDate: season.air_date,
      episodes: (season.episodes ?? []).map((episode) => ({
        episodeNumber: episode.episode_number,
        name: episode.name,
        overview: episode.overview,
        stillUrl: imageUrl(episode.still_path, "w300"),
        runtime: episode.runtime ?? undefined,
        voteAverage: episode.vote_average ?? 0
      }))
    };
  }

  async function canonicalSeason(
    id: TMDBId,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<TMDBCanonicalSeason | null> {
    const season = await seasonEpisodes(id, seasonNumber, signal);
    if (!season) return null;
    const airYear = Number(season.airDate?.slice(0, 4));
    const episodeOffset = Math.max(0, (season.episodes[0]?.episodeNumber ?? 1) - 1);
    return {
      seasonNumber,
      name: `Season ${seasonNumber}`,
      overview: season.overview,
      airDate: season.airDate,
      episodeCount: season.episodes.length,
      episodeOffset,
      year: Number.isFinite(airYear) && airYear > 1900 ? airYear : undefined,
      episodes: season.episodes.map((episode) => ({
        ...episode,
        episodeNumber: episode.episodeNumber - episodeOffset
      }))
    };
  }

  return {
    getTitle,
    getTitleRating,
    getEpisodePage,
    list,
    popular: (type, signal) => list(`/${type}/popular`, {}, signal),
    nowPlaying: (signal) => list("/movie/now_playing", {}, signal),
    search,
    searchAll,
    discover,
    findByImdbId,
    fullDetail,
    cardDetail: async (id, type, signal) => {
      const detail = await fullDetail(id, type, signal);
      return detail ? toCard(detail) : null;
    },
    details: async (id, type, signal) => {
      const detail = await fullDetail(id, type, signal);
      return detail ? toDetails(detail) : null;
    },
    related,
    credits,
    videos,
    seasonEpisodes,
    canonicalSeason
  };
}
