import { TMDB_BASE_URL } from "./constants";
import { getPosterUrl, getBackdropUrl, getProfileUrl, getLogoUrl } from "./imageHelpers";
import { getGenres, getYear, getRating, getTrailerKey, formatRuntime } from "./metadataHelpers";
import type {
  TMDBMediaType,
  TMDBBrowseListItem,
  TMDBBrowseListResponse,
  TMDBContentCard,
  TMDBItem,
  TMDBListItem,
  TMDBMovieListItem,
  TMDBTVListItem,
  TMDBMovieDetails,
  TMDBTVDetails,
  TMDBVideo,
  TMDBCreditResult,
  TMDBVideoResult,
  TMDBDetailsResult,
  TMDBSearchResult,
  TMDBDiscoverResult,
  TMDBFullDetail
} from "./types";
import { GENRE_MAP } from "./constants";

export function buildTmdbUrl(
  path: string,
  apiKey: string,
  params: Record<string, string | number | undefined> = {}
): string {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function fetchTmdbList(
  path: string,
  apiKey: string,
  signal: AbortSignal,
  params?: Record<string, string | number | undefined>
): Promise<TMDBBrowseListResponse> {
  const res = await fetch(buildTmdbUrl(path, apiKey, params), { signal });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return (await res.json()) as TMDBBrowseListResponse;
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

export async function fetchTmdbCredits(
  tmdbId: number,
  type: "movie" | "tv",
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBCreditResult | null> {
  const url = buildTmdbUrl(`/${type}/${tmdbId}/credits`, apiKey);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      cast: Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
      }>;
      crew: Array<{ id: number; name: string; job: string; department: string }>;
    };
    return {
      cast: data.cast.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profileUrl: getProfileUrl(c.profile_path),
        order: c.order
      })),
      directors: data.crew.filter((c) => c.job === "Director").map((c) => c.name)
    };
  } catch {
    return null;
  }
}

export async function fetchTmdbVideos(
  tmdbId: number,
  type: "movie" | "tv",
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBVideoResult[]> {
  const url = buildTmdbUrl(`/${type}/${tmdbId}/videos`, apiKey);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: TMDBVideo[] };
    return (data.results ?? [])
      .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
      .map((v) => ({ key: v.key, name: v.name, type: v.type, official: v.official }));
  } catch {
    return [];
  }
}

export async function fetchTmdbRelated(
  tmdbId: number,
  type: "movie" | "tv",
  apiKey: string,
  limit = 10,
  signal?: AbortSignal
): Promise<TMDBItem[]> {
  const url = buildTmdbUrl(`/${type}/${tmdbId}/recommendations`, apiKey);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: TMDBListItem[] };
    return (data.results ?? []).slice(0, limit).map((item) => {
      const isMovie = "title" in item;
      return {
        tmdbId: item.id,
        title: isMovie ? (item as TMDBMovieListItem).title : (item as TMDBTVListItem).name,
        type: (isMovie ? "movie" : "tv") as TMDBMediaType,
        posterUrl: getPosterUrl(item.poster_path),
        year: getYear(
          isMovie
            ? (item as TMDBMovieListItem).release_date
            : (item as TMDBTVListItem).first_air_date
        ),
        voteAverage: item.vote_average,
        genre: getGenres(item),
        rating: getRating(item.vote_average ?? 0)
      };
    });
  } catch {
    return [];
  }
}

export async function fetchTmdbDetails(
  tmdbId: string,
  type: TMDBMediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBDetailsResult | null> {
  const url = buildTmdbUrl(`/${type}/${tmdbId}`, apiKey, { append_to_response: "videos,images" });
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const d = (await res.json()) as TMDBMovieDetails & TMDBTVDetails;
    return {
      description: d.overview ?? "No description available",
      backdropUrl: d.backdrop_path ? getBackdropUrl(d.backdrop_path) : "",
      rating: getRating(d.vote_average ?? 0),
      logoUrl: getLogoUrl(d.images?.logos),
      trailerKey: getTrailerKey(d.videos?.results),
      duration: type === "movie" ? formatRuntime(d.runtime) : undefined,
      seasons: type === "tv" ? d.number_of_seasons : undefined,
      tagline: d.tagline ?? undefined,
      originalLanguage: d.original_language
    };
  } catch {
    return null;
  }
}

export async function fetchTmdbSearch(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBSearchResult> {
  const encoded = encodeURIComponent(query);
  const [moviesRes, showsRes] = await Promise.all([
    fetchTmdbListOrEmpty("/search/movie", apiKey, signal ?? new AbortController().signal, {
      query: encoded
    }),
    fetchTmdbListOrEmpty("/search/tv", apiKey, signal ?? new AbortController().signal, {
      query: encoded
    })
  ]);
  return {
    movies: (moviesRes.results ?? []).map((item) => toTMDBItem(item, "movie")),
    shows: (showsRes.results ?? []).map((item) => toTMDBItem(item, "tv"))
  };
}

export function tmdbSortParam(sortBy: string, type: TMDBMediaType): string {
  if (sortBy === "new" || sortBy === "year")
    return type === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
  if (sortBy === "rating") return "vote_average.desc";
  return "popularity.desc";
}

export async function fetchTmdbDiscover(
  type: TMDBMediaType,
  apiKey: string,
  signal: AbortSignal,
  opts: {
    page?: number;
    sortBy?: string;
    genreId?: number;
    minVoteCount?: number;
  } = {}
): Promise<TMDBDiscoverResult> {
  const params: Record<string, string | number | undefined> = {
    page: opts.page ?? 1,
    sort_by: tmdbSortParam(opts.sortBy ?? "popular", type),
    with_genres: opts.genreId,
    "vote_count.gte": opts.minVoteCount ?? 25
  };
  const res = await fetchTmdbListOrEmpty(`/discover/${type}`, apiKey, signal, params);
  return {
    items: (res.results ?? [])
      .map((item) => toTMDBContentCard(item, type))
      .filter((c): c is TMDBContentCard => !!c),
    totalPages: res.total_pages ?? 1,
    totalResults: res.total_results ?? 0
  };
}

export function toTMDBContentCard(
  item: TMDBBrowseListItem,
  typeHint?: TMDBMediaType
): TMDBContentCard | null {
  const type =
    typeHint ?? (item.media_type === "movie" || item.media_type === "tv" ? item.media_type : null);
  if (!type || item.media_type === "person") return null;
  const title = type === "movie" ? item.title : item.name;
  if (!item.id || !title || !item.poster_path) return null;

  const dateStr = type === "movie" ? item.release_date : item.first_air_date;
  const year = dateStr ? getYear(dateStr) : new Date().getFullYear();

  return {
    tmdbId: String(item.id),
    title,
    type,
    year,
    posterUrl: getPosterUrl(item.poster_path),
    voteAverage: item.vote_average,
    genre: (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[],
    isNew: false
  };
}

export function toTMDBItem(item: TMDBBrowseListItem, type: TMDBMediaType): TMDBItem {
  return {
    tmdbId: item.id,
    title: (type === "movie" ? item.title : item.name) ?? "",
    posterUrl: getPosterUrl(item.poster_path ?? null),
    year: getYear(type === "movie" ? item.release_date : item.first_air_date),
    genre: (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[],
    rating: getRating(item.vote_average ?? 0),
    voteAverage: item.vote_average,
    type
  };
}

export async function fetchTmdbFullDetail(
  tmdbId: string,
  type: TMDBMediaType,
  apiKey: string,
  signal?: AbortSignal
): Promise<TMDBFullDetail | null> {
  const url = buildTmdbUrl(`/${type}/${tmdbId}`, apiKey, {
    append_to_response: "external_ids,videos,images"
  });
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const d = (await res.json()) as TMDBMovieDetails & TMDBTVDetails;
    const genres = getGenres(d);
    const releaseDate = type === "movie" ? d.release_date : d.first_air_date;
    return {
      tmdbId,
      type,
      title: (type === "movie" ? d.title : d.name) ?? "",
      description: d.overview ?? "No description available",
      year: getYear(releaseDate),
      rating: getRating(d.vote_average ?? 0),
      voteAverage: d.vote_average,
      posterUrl: getPosterUrl(d.poster_path ?? null),
      backdropUrl: d.backdrop_path ? getBackdropUrl(d.backdrop_path) : "",
      logoUrl: getLogoUrl(d.images?.logos),
      trailerKey: getTrailerKey(d.videos?.results),
      duration: type === "movie" ? formatRuntime(d.runtime) : undefined,
      seasons: type === "tv" ? d.number_of_seasons : undefined,
      totalEpisodes: type === "tv" ? d.number_of_episodes : undefined,
      genre: genres,
      imdbId: (type === "movie" ? d.imdb_id ?? d.external_ids?.imdb_id : d.external_ids?.imdb_id) || undefined,
      originalLanguage: d.original_language,
      tagline: d.tagline || undefined,
      status: d.status || undefined,
      trending: false,
      isNew: false
    };
  } catch {
    return null;
  }
}

export async function fetchTmdbSeasonEpisodes(
  tmdbId: string,
  seasonNumber: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<{
  overview?: string;
  episodes: Array<{
    episodeNumber: number;
    name: string;
    overview?: string;
    stillUrl?: string;
    runtime?: number;
  }>;
} | null> {
  const url = buildTmdbUrl(`/tv/${tmdbId}/season/${seasonNumber}`, apiKey);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      overview?: string;
      episodes?: Array<{
        episode_number: number;
        name: string;
        overview?: string;
        still_path?: string | null;
        runtime?: number | null;
      }>;
    };
    return {
      overview: data.overview || undefined,
      episodes: (data.episodes ?? []).map((ep) => ({
        episodeNumber: ep.episode_number,
        name: ep.name,
        overview: ep.overview || undefined,
        stillUrl: ep.still_path ? getPosterUrl(ep.still_path, "w300") : undefined,
        runtime: ep.runtime ?? undefined
      }))
    };
  } catch {
    return null;
  }
}

export function collectTmdbCards(
  responses: Array<{ data: TMDBBrowseListResponse; type?: TMDBMediaType }>,
  opts: {
    excludedIds?: Set<string>;
    typeFilter?: "all" | TMDBMediaType;
  } = {}
): TMDBContentCard[] {
  const seen = new Set<string>();
  const cards: TMDBContentCard[] = [];
  for (const { data, type } of responses) {
    for (const item of data.results ?? []) {
      const card = toTMDBContentCard(item, type);
      if (!card?.tmdbId) continue;
      const key = `${card.type}:${card.tmdbId}`;
      if (opts.excludedIds?.has(key) || seen.has(key)) continue;
      if (opts.typeFilter && opts.typeFilter !== "all" && card.type !== opts.typeFilter) continue;
      seen.add(key);
      cards.push(card);
    }
  }
  return cards;
}
