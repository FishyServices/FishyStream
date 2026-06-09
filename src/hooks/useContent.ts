import { useAction } from "convex/react";
import { useEffect, useState, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type {
  ContentCard,
  ContentId,
  ContentCardWire,
  ContentFeatured,
  ContentFeaturedWire,
  ContentPlayback,
  ContentPlaybackWire,
  HomeViewWire
} from "../../shared/contentMetadata";
import {
  fromContentCardWire,
  fromContentFeaturedWire,
  fromContentPlaybackWire
} from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";

export interface BrowsePageResult {
  items: ContentCard[];
  currentPage: number;
  totalPages?: number;
  totalCount?: number;
  hasNextPage: boolean;
  canGoBack: boolean;
  isLoading: boolean;
  goNext: () => void;
  goPrevious: () => void;
}

export interface TMDBItem {
  tmdbId: number;
  title: string;
  posterUrl: string;
  year: number;
  genre?: string[];
  rating?: string;
  voteAverage?: number;
  type: "movie" | "tv";
}

type TMDBMediaType = "movie" | "tv";

type TMDBRecommendationSeed = {
  tmdbId: string;
  type: TMDBMediaType;
  genres?: string[];
};

type TMDBListItem = {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
};

type TMDBListResponse = {
  results?: TMDBListItem[];
  total_pages?: number;
  total_results?: number;
};

const TMDB_API_KEY = import.meta.env.VITE_TMDB_KEY ?? "84259f99204eeb7d45c7e3d8e36c6123";
import {
  TMDB_BASE_URL,
  TMDB_IMAGE_BASE,
  TMDB_DISCOVER_GENRES,
  getPosterUrl,
  getYear,
  getGenres,
  getRating
} from "../../shared/tmdb";

function tmdbImage(path?: string | null) {
  return path
    ? `${TMDB_IMAGE_BASE}/w500${path}`
    : "https://placehold.co/300x450/1a1a2e/555?text=No+Poster";
}

function tmdbYear(value?: string) {
  if (!value) return new Date().getFullYear();
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function tmdbUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function clientTmdbContentId(type: TMDBMediaType, tmdbId: number | string): ContentId {
  return `tmdb:${type}:${tmdbId}` as ContentId;
}

function toClientContentCard(item: TMDBListItem, typeHint?: TMDBMediaType): ContentCard | null {
  const type =
    typeHint ?? (item.media_type === "movie" || item.media_type === "tv" ? item.media_type : null);
  if (!type || item.media_type === "person") return null;
  const title = type === "movie" ? item.title : item.name;
  if (!item.id || !title || !item.poster_path) return null;

  return {
    _id: clientTmdbContentId(type, item.id),
    title,
    type,
    genre: [],
    year: tmdbYear(type === "movie" ? item.release_date : item.first_air_date),
    voteAverage: item.vote_average,
    posterUrl: tmdbImage(item.poster_path),
    tmdbId: String(item.id),
    new: false
  };
}

async function fetchTmdbList(
  path: string,
  signal: AbortSignal,
  params?: Record<string, string | number | undefined>
) {
  const res = await fetch(tmdbUrl(path, params), { signal });
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
  return (await res.json()) as TMDBListResponse;
}

async function fetchTmdbListOrEmpty(
  path: string,
  signal: AbortSignal,
  params?: Record<string, string | number | undefined>
) {
  try {
    return await fetchTmdbList(path, signal, params);
  } catch {
    return { results: [] };
  }
}

function shuffleWithSeed<T>(items: T[], seed: number) {
  return items
    .map((item, index) => {
      const score = Math.sin((index + 1) * 999 + seed * 9973) * 10000;
      return { item, score: score - Math.floor(score) };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export function useHomepageContent() {
  const [homepage, setHomepage] = useState<
    | {
        featured: ContentFeatured[];
        categories: Array<{ id: string; title: string; content: ContentCard[] }>;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [moviesRes, tvRes, newRes] = await Promise.all([
          fetchTmdbListOrEmpty("/movie/popular", controller.signal),
          fetchTmdbListOrEmpty("/tv/popular", controller.signal),
          fetchTmdbListOrEmpty("/movie/now_playing", controller.signal)
        ]);

        const popularMovies = (moviesRes.results ?? [])
          .map((item) => toClientContentCard(item, "movie"))
          .filter((item): item is ContentCard => !!item);

        const popularTv = (tvRes.results ?? [])
          .map((item) => toClientContentCard(item, "tv"))
          .filter((item): item is ContentCard => !!item);

        const newReleases = (newRes.results ?? [])
          .map((item) => toClientContentCard(item, "movie"))
          .filter((item): item is ContentCard => !!item);

        const featuredCandidates = [...popularMovies.slice(0, 2), ...popularTv.slice(0, 2)];

        const featuredDetails = await Promise.all(
          featuredCandidates.map(async (card) => {
            try {
              const res = await fetch(
                tmdbUrl(`/${card.type}/${card.tmdbId}`, { append_to_response: "videos,images" }),
                { signal: controller.signal }
              );
              if (!res.ok) return null;
              const details = await res.json();

              const logos = details.images?.logos;
              const logoPath = logos && logos.length > 0 ? logos[0].file_path : null;
              const logoUrl = logoPath ? `${TMDB_IMAGE_BASE}/w500${logoPath}` : undefined;

              const videos = details.videos?.results;
              const trailerKey =
                videos && videos.length > 0
                  ? videos.find((v: any) => v.type === "Trailer")?.key || videos[0].key
                  : undefined;

              const voteAverage = details.vote_average ?? card.voteAverage;
              const rating =
                voteAverage && voteAverage >= 7.5
                  ? "PG-13"
                  : voteAverage && voteAverage >= 5
                    ? "PG"
                    : "G";

              return {
                ...card,
                description: details.overview ?? "No description available",
                backdropUrl: details.backdrop_path
                  ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
                  : card.posterUrl,
                rating,
                logoUrl,
                trailerKey,
                duration:
                  card.type === "movie"
                    ? details.runtime
                      ? `${details.runtime}m`
                      : undefined
                    : undefined,
                seasons: card.type === "tv" ? details.number_of_seasons : undefined,
                trending: true,
                tagline: details.tagline,
                originalLanguage: details.original_language
              } as ContentFeatured;
            } catch {
              return null;
            }
          })
        );

        const featured = featuredDetails.filter((item): item is ContentFeatured => !!item);

        if (!controller.signal.aborted) {
          setHomepage({
            featured,
            categories: [
              { id: "movies", title: "Popular Movies", content: popularMovies },
              { id: "tvshows", title: "Popular TV Shows", content: popularTv },
              { id: "new", title: "New Releases", content: newReleases }
            ]
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setHomepage({ featured: [], categories: [] });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return homepage;
}

export function useNewReleases() {
  const [newReleases, setNewReleases] = useState<ContentCard[] | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetchTmdbListOrEmpty("/movie/now_playing", controller.signal);
        const cards = (res.results ?? [])
          .map((item) => toClientContentCard(item, "movie"))
          .filter((item): item is ContentCard => !!item);

        if (!controller.signal.aborted) {
          setNewReleases(cards);
        }
      } catch {
        if (!controller.signal.aborted) {
          setNewReleases([]);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return newReleases;
}

export function useContentPlaybackByTmdbId(tmdbId: string | undefined, typeHint?: "movie" | "tv") {
  const syncSingleContent = useAction(api.tmdb.syncSingleContent);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [isSyncingMissing, setIsSyncingMissing] = useState(false);
  const data = useOneShotConvexQuery<ContentPlaybackWire | null>(
    !!tmdbId,
    (convex) =>
      convex.query(api.content.getContentPlaybackByTmdbId, {
        tmdbId: tmdbId!,
        type: typeHint
      }),
    [tmdbId, typeHint, syncAttempt],
    undefined,
    tmdbId ? `contentPlayback:${tmdbId}:${typeHint ?? "any"}:${syncAttempt}` : undefined
  );

  useEffect(() => {
    if (!tmdbId || !typeHint || data !== null || isSyncingMissing || syncAttempt > 0) return;
    const parsedTmdbId = Number(tmdbId);
    if (!Number.isFinite(parsedTmdbId)) return;

    let cancelled = false;
    setIsSyncingMissing(true);
    const syncMissing = async () => {
      await syncSingleContent({ tmdbId: parsedTmdbId, type: typeHint });
      if (!cancelled) {
        setSyncAttempt((value) => value + 1);
      }
    };

    void syncMissing().finally(() => {
      if (!cancelled) setIsSyncingMissing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [data, isSyncingMissing, syncAttempt, syncSingleContent, tmdbId, typeHint]);

  if (data === null && isSyncingMissing) return undefined;
  return data ? fromContentPlaybackWire(data) : data;
}

export function useRelatedContent(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  limit = 10,
  enabled = true
) {
  const [related, setRelated] = useState<TMDBItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const getRelated = useAction(api.tmdb.getRelated);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setRelated([]);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getRelated({ tmdbId, type, limit });
        if (!cancelRef.current) setRelated(res as TMDBItem[]);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 100);
    return () => {
      clearTimeout(t);
      cancelRef.current = true;
    };
  }, [tmdbId, type, limit, enabled]);

  return { related, isLoading };
}

export function useContentCredits(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  enabled = true
) {
  const [credits, setCredits] = useState<{
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profileUrl?: string;
      order: number;
    }>;
    directors: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const getCredits = useAction(api.tmdb.getCredits);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setCredits(null);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getCredits({ tmdbId, type });
        if (!cancelRef.current) setCredits(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 150);
    return () => {
      clearTimeout(t);
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled]);

  return { credits, isLoading };
}

export function useContentVideos(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  enabled = true
) {
  const [videos, setVideos] = useState<
    Array<{ key: string; name: string; type: string; official: boolean }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const getVideos = useAction(api.tmdb.getVideos);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setVideos([]);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getVideos({ tmdbId, type });
        if (!cancelRef.current) setVideos(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 200);
    return () => {
      clearTimeout(t);
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled]);

  return { videos, isLoading };
}

export function useSearchAll(query: string) {
  const [results, setResults] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    const t = setTimeout(async () => {
      try {
        const [moviesRes, showsRes] = await Promise.all([
          fetchTmdbListOrEmpty("/search/movie", controller.signal, {
            query: encodeURIComponent(query)
          }),
          fetchTmdbListOrEmpty("/search/tv", controller.signal, {
            query: encodeURIComponent(query)
          })
        ]);

        const movies = (moviesRes.results ?? []).map((item) => {
          const yearVal = getYear(item.release_date);
          return {
            tmdbId: item.id,
            title: item.title ?? "",
            posterUrl: getPosterUrl(item.poster_path ?? null),
            year: yearVal,
            genre: getGenres(item),
            rating: getRating(item.vote_average ?? 0),
            voteAverage: item.vote_average,
            type: "movie" as const
          };
        });

        const shows = (showsRes.results ?? []).map((item) => {
          const yearVal = getYear(item.first_air_date);
          return {
            tmdbId: item.id,
            title: item.name ?? "",
            posterUrl: getPosterUrl(item.poster_path ?? null),
            year: yearVal,
            genre: getGenres(item),
            rating: getRating(item.vote_average ?? 0),
            voteAverage: item.vote_average,
            type: "tv" as const
          };
        });

        if (!controller.signal.aborted) {
          setResults([...movies, ...shows]);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Search failed");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return { results, loading, error };
}

export type ContentSort = "trending" | "popular" | "new" | "rating" | "year";

export function usePaginatedContent(
  type: "movie" | "tv",
  genre: string | undefined,
  sortBy: ContentSort,
  limit = 24,
  page = 1
): BrowsePageResult {
  const [result, setResult] = useState<{
    items: ContentCard[];
    currentPage: number;
    totalPages?: number;
    totalCount?: number;
    hasNextPage: boolean;
    canGoBack: boolean;
    isLoading: boolean;
  }>({
    items: [],
    currentPage: page,
    hasNextPage: false,
    canGoBack: false,
    isLoading: true
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setResult((prev) => ({ ...prev, isLoading: true }));
      try {
        const genreId = genre ? TMDB_DISCOVER_GENRES[genre.toLowerCase()] : undefined;
        const path = `/discover/${type}`;

        let tmdbSort = "popularity.desc";
        if (sortBy === "new") {
          tmdbSort = type === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
        } else if (sortBy === "rating") {
          tmdbSort = "vote_average.desc";
        } else if (sortBy === "year") {
          tmdbSort = type === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
        }

        const params: Record<string, string | number | undefined> = {
          page,
          sort_by: tmdbSort,
          with_genres: genreId,
          "vote_count.gte": sortBy === "rating" ? 100 : 25
        };

        const res = await fetchTmdbListOrEmpty(path, controller.signal, params);
        const items = (res.results ?? [])
          .map((item) => toClientContentCard(item, type))
          .filter((item): item is ContentCard => !!item);

        if (!controller.signal.aborted) {
          setResult({
            items,
            currentPage: page,
            totalPages: res.total_pages,
            totalCount: res.total_results,
            hasNextPage: page < (res.total_pages ?? 1),
            canGoBack: page > 1,
            isLoading: false
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult((prev) => ({ ...prev, isLoading: false }));
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [type, genre, sortBy, page]);

  return {
    ...result,
    goNext: () => {},
    goPrevious: () => {}
  };
}

export function useRecommendations(
  limit = 12,
  typeFilter: "all" | "movie" | "tv" = "all",
  refreshSeed = 0,
  enabled = true,
  seed?: {
    tmdbSeeds?: TMDBRecommendationSeed[];
    preferredType: "movie" | "tv";
    genres: string[];
  }
) {
  const [recommendations, setRecommendations] = useState<ContentCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const seedSignature = seed?.tmdbSeeds
    ?.map((item) => `${item.type}:${item.tmdbId}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!enabled) {
      setRecommendations([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const excludedIds = new Set(seed?.tmdbSeeds?.map((item) => `${item.type}:${item.tmdbId}`));
    const genreIds = Array.from(
      new Set(
        (seed?.genres ?? [])
          .map((genre) => TMDB_DISCOVER_GENRES[genre.trim().toLowerCase()])
          .filter((id): id is number => typeof id === "number")
      )
    ).slice(0, 3);
    const seedItems = shuffleWithSeed(seed?.tmdbSeeds ?? [], refreshSeed)
      .filter((item) => typeFilter === "all" || item.type === typeFilter)
      .slice(0, 5);

    const collectCards = (responses: Array<{ data: TMDBListResponse; type?: TMDBMediaType }>) => {
      const seen = new Set<string>();
      const cards: ContentCard[] = [];
      for (const response of responses) {
        for (const item of response.data.results ?? []) {
          const card = toClientContentCard(item, response.type);
          if (!card?.tmdbId) continue;
          const key = `${card.type}:${card.tmdbId}`;
          if (excludedIds.has(key) || seen.has(key)) continue;
          if (typeFilter !== "all" && card.type !== typeFilter) continue;
          seen.add(key);
          cards.push(card);
        }
      }
      return cards;
    };

    const fallbackTypes: TMDBMediaType[] =
      typeFilter === "all" ? [seed?.preferredType ?? "movie", "tv", "movie"] : [typeFilter];

    async function load() {
      setIsLoading(true);
      try {
        const recommendationResponses = seedItems.length
          ? await Promise.all(
              seedItems.flatMap((item) => [
                fetchTmdbListOrEmpty(
                  `/${item.type}/${item.tmdbId}/recommendations`,
                  controller.signal,
                  { page: 1 }
                ).then((data) => ({ data, type: item.type })),
                fetchTmdbListOrEmpty(`/${item.type}/${item.tmdbId}/similar`, controller.signal, {
                  page: 1
                }).then((data) => ({ data, type: item.type }))
              ])
            )
          : [];

        let cards = collectCards(recommendationResponses);

        if (cards.length < limit) {
          const genreResponses = genreIds.length
            ? await Promise.all(
                fallbackTypes.map((type) =>
                  fetchTmdbListOrEmpty(`/discover/${type}`, controller.signal, {
                    page: (refreshSeed % 5) + 1,
                    sort_by: "popularity.desc",
                    with_genres: genreIds.join("|")
                  }).then((data) => ({ data, type }))
                )
              )
            : [];
          cards = [...cards, ...collectCards(genreResponses)];
        }

        if (cards.length < limit) {
          const trendingResponses = await Promise.all(
            (typeFilter === "all" ? ([undefined] as const) : ([typeFilter] as const)).map((type) =>
              fetchTmdbListOrEmpty(
                type ? `/trending/${type}/week` : "/trending/all/week",
                controller.signal,
                { page: (refreshSeed % 5) + 1 }
              ).then((data) => ({ data, type }))
            )
          );
          cards = [...cards, ...collectCards(trendingResponses)];
        }

        if (!controller.signal.aborted) {
          const deduped = Array.from(
            new Map(cards.map((card) => [`${card.type}:${card.tmdbId}`, card])).values()
          );
          setRecommendations(shuffleWithSeed(deduped, refreshSeed).slice(0, limit));
        }
      } catch {
        if (!controller.signal.aborted) setRecommendations([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [
    enabled,
    limit,
    typeFilter,
    refreshSeed,
    seed?.preferredType,
    seedSignature,
    seed?.genres.join("|")
  ]);

  return {
    recommendations,
    isLoading
  };
}
