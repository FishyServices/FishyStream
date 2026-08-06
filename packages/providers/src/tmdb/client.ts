import type {
  EpisodePage,
  MediaType,
  MetadataClient,
  Rating,
  TitleReference,
  TMDBBrowseListItem,
  TMDBBrowseListResponse,
  TMDBContentCard,
  TMDBCreditResult,
  TMDBDetailsResult,
  TMDBDiscoverResult,
  TMDBFullDetail,
  TMDBItem,
  TMDBVideoResult
} from "./types.js";
import { resolveAniListEpisodeAddress, resolveAniListId } from "../anime/anilistResolver.js";

export const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_DISCOVER_GENRES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  "science fiction": 878,
  "sci-fi": 878,
  thriller: 53,
  war: 10752,
  western: 37
};
const genres: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  53: "Thriller",
  10752: "War",
  37: "Western"
};
const image = (path?: string | null, size = "w500") =>
  path
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "https://placehold.co/500x750/1a1a2e/666?text=No+Poster";
const year = (date?: string) => Number(date?.slice(0, 4)) || new Date().getFullYear();
const mediaTitle = (item: TMDBBrowseListItem, type: MediaType) =>
  type === "movie" ? (item.title ?? "") : (item.name ?? "");
const mediaGenres = (
  item: TMDBBrowseListItem & {
    genres?: Array<{ id?: number; name?: string }>;
  }
) => {
  if (item.genres?.length) {
    return item.genres
      .map((genre) => genre.name ?? genres[genre.id ?? -1])
      .filter((name): name is string => !!name);
  }

  return (item.genre_ids ?? []).map((id) => genres[id]).filter((name): name is string => !!name);
};
const ageRating = (rating = 0) => (rating >= 7.5 ? "PG-13" : rating >= 5 ? "PG" : "G");
const certification = (value: Record<string, any>, type: MediaType) => {
  if (type === "tv") {
    return value.content_ratings?.results?.find(
      (item: { iso_3166_1?: string; rating?: string }) => item.iso_3166_1 === "US" && item.rating
    )?.rating;
  }

  return value.release_dates?.results
    ?.find((item: { iso_3166_1?: string }) => item.iso_3166_1 === "US")
    ?.release_dates?.find((item: { certification?: string }) => item.certification)?.certification;
};

export type TMDBRequest = (
  path: string,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal
) => Promise<unknown>;
export function createTMDBRequest(apiKey: string): TMDBRequest {
  return async (path, params, signal) => {
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", "en-US");
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`TMDB ${path} failed: ${response.status}`);
    return response.json();
  };
}
export function createTMDBClient(request: TMDBRequest): MetadataClient {
  const type = (reference: TitleReference): MediaType => {
    if (!reference.type) throw new Error("TMDB references require type");
    return reference.type;
  };
  return {
    async getTitle(reference, signal) {
      const value = (await request(
        `/${type(reference)}/${reference.id}`,
        {},
        signal
      )) as TMDBBrowseListItem;
      const title = mediaTitle(value, type(reference));
      return title
        ? {
            id: reference.id,
            type: type(reference),
            title,
            rating: { value: value.vote_average ?? 0, voteCount: value.vote_count }
          }
        : null;
    },
    async getTitleRating(reference, signal) {
      return (await this.getTitle(reference, signal))?.rating ?? null;
    },
    async getEpisodePage(reference, signal): Promise<EpisodePage> {
      if (type(reference) !== "tv" || reference.seasonNumber == null)
        throw new Error("TMDB episode references require TV type and seasonNumber");
      const value = (await request(
        `/tv/${reference.id}/season/${reference.seasonNumber}`,
        {},
        signal
      )) as {
        episodes?: Array<{
          id: number;
          episode_number: number;
          name: string;
          vote_average?: number;
        }>;
      };
      return {
        episodes: (value.episodes ?? []).map((episode) => ({
          id: String(episode.id),
          type: "tv",
          title: episode.name,
          seasonNumber: reference.seasonNumber,
          episodeNumber: episode.episode_number,
          rating: { value: episode.vote_average ?? 0 }
        }))
      };
    }
  };
}
export async function fetchTmdbList(
  path: string,
  apiKey: string,
  signal: AbortSignal,
  params: Record<string, string | number | undefined> = {}
): Promise<TMDBBrowseListResponse> {
  return createTMDBRequest(apiKey)(path, params, signal) as Promise<TMDBBrowseListResponse>;
}
export async function fetchTmdbListOrEmpty(
  path: string,
  apiKey: string,
  signal: AbortSignal,
  params?: Record<string, string | number | undefined>
): Promise<TMDBBrowseListResponse> {
  try {
    return await fetchTmdbList(path, apiKey, signal, params);
  } catch {
    return { results: [] };
  }
}
export function toTMDBContentCard(
  item: TMDBBrowseListItem,
  type?: MediaType
): TMDBContentCard | null {
  const resolved =
    type ?? (item.media_type === "movie" || item.media_type === "tv" ? item.media_type : undefined);
  const title = resolved ? mediaTitle(item, resolved) : "";
  if (!resolved || !title || !item.poster_path) return null;
  return {
    tmdbId: String(item.id),
    type: resolved,
    title,
    year: year(resolved === "movie" ? item.release_date : item.first_air_date),
    posterUrl: image(item.poster_path),
    voteAverage: item.vote_average,
    genre: mediaGenres(item),
    isNew: false
  };
}
export function collectTmdbCards(
  responses: Array<{ data: TMDBBrowseListResponse; type?: MediaType }>,
  options: { excludedIds?: Set<string>; typeFilter?: "all" | MediaType } = {}
): TMDBContentCard[] {
  const seen = new Set<string>();
  return responses.flatMap(({ data, type }) =>
    (data.results ?? [])
      .map((item) => toTMDBContentCard(item, type))
      .filter((card): card is TMDBContentCard => !!card)
      .filter((card) => {
        const key = `${card.type}:${card.tmdbId}`;
        if (
          seen.has(key) ||
          options.excludedIds?.has(key) ||
          (options.typeFilter && options.typeFilter !== "all" && card.type !== options.typeFilter)
        )
          return false;
        seen.add(key);
        return true;
      })
  );
}
export async function fetchTmdbSearch(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ movies: TMDBItem[]; shows: TMDBItem[] }> {
  const abort = signal ?? new AbortController().signal;
  const map = (items: TMDBBrowseListItem[], type: MediaType): TMDBItem[] =>
    items.map((item) => ({
      tmdbId: item.id,
      title: mediaTitle(item, type),
      posterUrl: image(item.poster_path),
      year: year(type === "movie" ? item.release_date : item.first_air_date),
      genre: mediaGenres(item),
      rating: ageRating(item.vote_average),
      voteAverage: item.vote_average,
      type
    }));
  const [movies, shows] = await Promise.all([
    fetchTmdbListOrEmpty("/search/movie", apiKey, abort, { query }),
    fetchTmdbListOrEmpty("/search/tv", apiKey, abort, { query })
  ]);
  return { movies: map(movies.results ?? [], "movie"), shows: map(shows.results ?? [], "tv") };
}
export async function fetchTmdbDiscover(
  type: MediaType,
  apiKey: string,
  signal: AbortSignal,
  options: { page?: number; sortBy?: string; genreId?: number; minVoteCount?: number } = {}
): Promise<TMDBDiscoverResult> {
  const path =
    options.sortBy === "trending" && !options.genreId
      ? `/trending/${type}/week`
      : `/discover/${type}`;
  const data = await fetchTmdbListOrEmpty(path, apiKey, signal, {
    page: options.page ?? 1,
    with_genres: options.genreId,
    sort_by: options.sortBy === "rating" ? "vote_average.desc" : "popularity.desc",
    "vote_count.gte": options.minVoteCount ?? 25
  });
  return {
    items: (data.results ?? [])
      .map((item) => toTMDBContentCard(item, type))
      .filter((item): item is TMDBContentCard => !!item),
    totalPages: data.total_pages ?? 1,
    totalResults: data.total_results ?? 0
  };
}
async function detail(
  id: string,
  type: MediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<(TMDBBrowseListItem & Record<string, unknown>) | null> {
  try {
    return (await createTMDBRequest(apiKey)(
      `/${type}/${id}`,
      {
        append_to_response: `videos,images,external_ids,${
          type === "tv" ? "content_ratings" : "release_dates"
        }`
      },
      signal
    )) as TMDBBrowseListItem & Record<string, unknown>;
  } catch {
    return null;
  }
}
export async function fetchTmdbFullDetail(
  id: string,
  type: MediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBFullDetail | null> {
  const value = await detail(id, type, apiKey, signal);
  if (!value) return null;
  const title = mediaTitle(value, type);
  if (!title) return null;
  const data = value as Record<string, any>;
  return {
    tmdbId: id,
    type,
    title,
    description: value.overview ?? "No description available",
    year: year(type === "movie" ? value.release_date : value.first_air_date),
    rating: certification(data, type) || ageRating(value.vote_average),
    voteAverage: value.vote_average,
    posterUrl: image(value.poster_path),
    backdropUrl: value.backdrop_path ? image(value.backdrop_path, "original") : "",
    duration:
      type === "movie" && data.runtime
        ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`
        : undefined,
    seasons: type === "tv" ? data.number_of_seasons : undefined,
    totalEpisodes: type === "tv" ? data.number_of_episodes : undefined,
    hasSpecials:
      type === "tv"
        ? data.seasons?.some((season: { season_number: number }) => season.season_number === 0)
        : undefined,
    genre: mediaGenres(value),
    imdbId: data.imdb_id ?? data.external_ids?.imdb_id,
    originalLanguage: value.original_language,
    tagline: data.tagline || undefined,
    status: data.status || undefined,
    trending: false,
    isNew: false
  };
}
export async function fetchTmdbCardDetail(
  id: string,
  type: MediaType,
  apiKey: string,
  signal?: AbortSignal
) {
  const value = await fetchTmdbFullDetail(id, type, apiKey, signal);
  return value
    ? {
        tmdbId: value.tmdbId,
        type: value.type,
        title: value.title,
        year: value.year,
        posterUrl: value.posterUrl,
        voteAverage: value.voteAverage,
        genre: value.genre,
        isNew: false
      }
    : null;
}
export async function fetchTmdbDetails(
  id: number | string,
  type: MediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBDetailsResult | null> {
  const value = await fetchTmdbFullDetail(String(id), type, apiKey, signal);
  return value
    ? {
        description: value.description,
        backdropUrl: value.backdropUrl,
        rating: value.rating,
        duration: value.duration,
        seasons: value.seasons,
        hasSpecials: value.hasSpecials,
        tagline: value.tagline,
        originalLanguage: value.originalLanguage
      }
    : null;
}
export async function fetchTmdbRelated(
  id: number,
  type: MediaType,
  apiKey: string,
  limit = 10,
  signal?: AbortSignal
): Promise<TMDBItem[]> {
  const data = await fetchTmdbListOrEmpty(
    `/${type}/${id}/recommendations`,
    apiKey,
    signal ?? new AbortController().signal
  );
  return (data.results ?? []).slice(0, limit).map((item) => ({
    tmdbId: item.id,
    title: mediaTitle(item, type),
    posterUrl: image(item.poster_path),
    year: year(type === "movie" ? item.release_date : item.first_air_date),
    genre: mediaGenres(item),
    rating: ageRating(item.vote_average),
    voteAverage: item.vote_average,
    type
  }));
}
export async function fetchTmdbCredits(
  id: number,
  type: MediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBCreditResult | null> {
  try {
    const value = (await createTMDBRequest(apiKey)(`/${type}/${id}/credits`, {}, signal)) as {
      cast?: Array<{
        id: number;
        name: string;
        character?: string;
        profile_path?: string | null;
        order?: number;
      }>;
      crew?: Array<{ name: string; job: string }>;
    };
    return {
      cast: (value.cast ?? []).slice(0, 20).map((actor, order) => ({
        id: actor.id,
        name: actor.name,
        character: actor.character ?? "",
        profileUrl: actor.profile_path ? image(actor.profile_path, "w185") : "",
        order: actor.order ?? order
      })),
      directors: (value.crew ?? [])
        .filter((member) => member.job === "Director")
        .map((member) => member.name)
    };
  } catch {
    return null;
  }
}
export async function fetchTmdbVideos(
  id: number,
  type: MediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBVideoResult[]> {
  try {
    const value = (await createTMDBRequest(apiKey)(`/${type}/${id}/videos`, {}, signal)) as {
      results?: Array<{
        key?: string;
        name?: string;
        site?: string;
        type?: string;
        official?: boolean;
      }>;
    };
    return (value.results ?? [])
      .filter(
        (video) =>
          video.site === "YouTube" &&
          !!video.key &&
          !!video.name &&
          (video.type === "Trailer" || video.type === "Teaser")
      )
      .map((video) => ({
        key: video.key!,
        name: video.name!,
        type: video.type!,
        official: video.official === true
      }));
  } catch {
    return [];
  }
}
export async function fetchTmdbSeasonEpisodes(
  id: string,
  seasonNumber: number,
  apiKey: string,
  signal?: AbortSignal
) {
  try {
    const value = (await createTMDBRequest(apiKey)(
      `/tv/${id}/season/${seasonNumber}`,
      {},
      signal
    )) as {
      overview?: string;
      air_date?: string;
      episodes?: Array<{
        episode_number: number;
        name: string;
        overview?: string;
        still_path?: string;
        runtime?: number | null;
        vote_average?: number;
      }>;
    };
    return {
      overview: value.overview,
      airDate: value.air_date,
      episodes: (value.episodes ?? []).map((episode) => ({
        episodeNumber: episode.episode_number,
        name: episode.name,
        overview: episode.overview,
        stillUrl: episode.still_path ? image(episode.still_path, "w300") : undefined,
        runtime: episode.runtime ?? undefined,
        voteAverage: episode.vote_average ?? 0
      }))
    };
  } catch {
    return null;
  }
}
export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  return items
    .map((item, index) => ({ item, score: Math.sin((index + 1) * 999 + seed * 9973) }))
    .sort((left, right) => left.score - right.score)
    .map(({ item }) => item);
}
export async function buildCanonicalSeasonPayload(tmdbId: string, seasonNumber: number) {
  const season = await fetchTmdbSeasonEpisodes(tmdbId, seasonNumber, TMDB_API_KEY);
  if (!season) return null;
  const seasonYear = Number(season.airDate?.slice(0, 4));
  return {
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: season.overview,
    airDate: season.airDate,
    episodeCount: season.episodes.length,
    year: Number.isFinite(seasonYear) && seasonYear > 1900 ? seasonYear : undefined,
    episodes: season.episodes.map((episode) => ({ ...episode, airDate: undefined }))
  };
}
export async function resolveSeasonAniListId(args: {
  title?: string;
  seasonNumber: number;
  seasonTitle?: string;
  year?: number;
}) {
  return resolveAniListId({
    title: args.title,
    season: args.seasonNumber,
    seasonTitle: args.seasonTitle,
    year: args.year
  });
}
export async function buildAniListEpisodeMappings(args: {
  anilistId?: string | null;
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
  episodes: Array<{ episodeNumber: number }>;
}) {
  if (!args.anilistId) return undefined;
  const values = await Promise.all(
    args.episodes.map(async (episode) => {
      const address = await resolveAniListEpisodeAddress({
        anilistId: args.anilistId,
        title: args.title,
        season: args.season,
        seasonTitle: args.seasonTitle,
        year: args.year,
        episode: episode.episodeNumber
      });
      return address
        ? {
            episodeNumber: episode.episodeNumber,
            anilistId: address.anilistId,
            anilistEpisodeNumber: address.episode
          }
        : null;
    })
  );
  const mappings = values.filter(
    (value): value is { episodeNumber: number; anilistId: string; anilistEpisodeNumber: number } =>
      !!value
  );
  return mappings.length ? mappings : undefined;
}
