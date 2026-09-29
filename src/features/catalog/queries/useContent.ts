import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useContinueWatching, useMyWatchHistory } from "@/features/library/useWatchHistory";
import { useRecommendationFolderScope } from "@/features/catalog/recommendationFolderScope";
import type { ContentCard, ContentFeatured, ContentPlayback } from "@content/contentMetadata";
import { makeContentId } from "@content/contentMetadata";
import {
  TMDB_API_KEY,
  TMDB_DISCOVER_GENRES,
  TMDB_TV_DISCOVER_GENRES,
  collectTmdbCards,
  fetchTmdbCardDetail,
  fetchTmdbCredits,
  fetchTmdbDetails,
  fetchTmdbDiscover,
  fetchTmdbFullDetail,
  fetchTmdbIdByImdbId,
  fetchTmdbListOrEmpty,
  fetchTmdbRelated,
  fetchTmdbSearch,
  fetchTmdbSeasonEpisodes,
  fetchTmdbVideos,
  toTMDBContentCard,
  type TMDBBrowseListResponse,
  type TMDBContentCard,
  type TMDBCreditResult,
  type TMDBFullDetail,
  type TMDBItem,
  type TMDBMediaType,
  type TMDBVideoResult
} from "@fishy/providers/tmdb";
import {
  createIMDbProxyRequest,
  fetchImdbDiscover,
  fetchImdbFullDetail,
  fetchImdbSeasonEpisodes
} from "@fishy/providers/imdb";
import { fetchAnimeFillerEpisodes } from "@fishy/providers/anime";
import ownersPicksData from "../ownersPicks.json";
import { isBlockedContent } from "../model/contentPolicy";
import { selectFreshRecommendations, shuffleWithSeed } from "../recommendationSelection";

export type { TMDBItem, TMDBFullDetail };

export interface OwnerPickItem {
  tmdbId: string;
  title: string;
  rank?: number;
}

export function sortOwnerPicksByRank<T extends OwnerPickItem>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.title.localeCompare(right.title);
  });
}

const imdbRequest = createIMDbProxyRequest("/api/imdb");
const curatedCache = new Map<string, TMDBContentCard>();
const queryCache = new Map<string, unknown>();
const imdbSeasonRequests = new Map<string, ReturnType<typeof fetchImdbSeasonEpisodes>>();

function loadImdbSeasonEpisodes(imdbId: string, seasonNumber: number, signal: AbortSignal) {
  const key = `${imdbId}:${seasonNumber}`;
  const cached = imdbSeasonRequests.get(key);
  if (cached) return cached;

  const request = fetchImdbSeasonEpisodes(imdbId, seasonNumber, imdbRequest, signal);
  imdbSeasonRequests.set(key, request);
  void request.catch(() => {
    if (imdbSeasonRequests.get(key) === request) imdbSeasonRequests.delete(key);
  });
  return request;
}

export interface BrowsePageResult {
  items: ContentCard[];
  currentPage: number;
  totalPages?: number;
  totalCount?: number;
  hasNextPage: boolean;
  canGoBack: boolean;
  isLoading: boolean;
}

export type ContentSort = "trending" | "popular" | "new" | "rating" | "year";
export type AnimeMediaFilter = "all" | "movie" | "tv";
export type AnimeSort = "popular" | "newest" | "oldest" | "top-rated";

interface AnimeCatalogApiResponse {
  items: ContentCard[];
  totalPages: number;
  totalResults?: number;
}
type RecommendationSeedSource = "continue" | "bookmark" | "history";

export type RecommendationSeed = {
  tmdbId: string;
  type: TMDBMediaType;
  genres?: string[];
  weight?: number;
  source?: RecommendationSeedSource;
};

function apiKey(): string {
  const configured = import.meta.env.VITE_TMDB_KEY;
  return typeof configured === "string" && configured.trim() ? configured : TMDB_API_KEY;
}

function cardKey(value: Pick<ContentCard, "type" | "tmdbId">): string {
  return `${value.type}:${value.tmdbId ?? ""}`;
}

function isTmdbId(value: string | undefined): value is string {
  return !!value && /^\d+$/.test(value);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function aborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function cardFromProvider(
  value: Parameters<typeof toTMDBContentCard>[0],
  hint?: TMDBMediaType
): ContentCard | null {
  const card = toTMDBContentCard(value, hint);
  if (card && isBlockedContent({ tmdbId: card.tmdbId, type: card.type })) return null;
  return card
    ? {
        _id: makeContentId(card.type, card.tmdbId),
        title: card.title,
        type: card.type,
        genre: card.genre,
        year: card.year,
        voteAverage: card.voteAverage,
        releaseDate: card.releaseDate,
        popularity: card.popularity,
        posterUrl: card.posterUrl,
        tmdbId: card.tmdbId,
        new: card.isNew
      }
    : null;
}

function cardFromTmdb(card: TMDBContentCard): ContentCard | null {
  if (isBlockedContent({ tmdbId: card.tmdbId, type: card.type })) return null;
  return {
    _id: makeContentId(card.type, card.tmdbId),
    title: card.title,
    type: card.type,
    genre: card.genre,
    year: card.year,
    voteAverage: card.voteAverage,
    releaseDate: card.releaseDate,
    popularity: card.popularity,
    posterUrl: card.posterUrl,
    tmdbId: card.tmdbId,
    new: card.isNew
  };
}

function cardsFromList(response: TMDBBrowseListResponse, type: TMDBMediaType): ContentCard[] {
  return (response.results ?? [])
    .map((item) => cardFromProvider(item, type))
    .filter((item): item is ContentCard => item !== null);
}

function useCancellableLoad<T>(
  enabled: boolean,
  dependencies: readonly unknown[],
  load: (signal: AbortSignal) => Promise<T>,
  initial: T,
  cacheKey?: string
): { value: T; isLoading: boolean; error: string | null } {
  const [value, setValue] = useState<T>(initial);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(initial);
      setIsLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    if (cacheKey && queryCache.has(cacheKey)) {
      setValue(queryCache.get(cacheKey) as T);
      setIsLoading(false);
      setError(null);
      return () => controller.abort();
    }
    setIsLoading(true);
    setError(null);
    void load(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          if (cacheKey) queryCache.set(cacheKey, next);
          setValue(next);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && !aborted(reason))
          setError(message(reason, "Request failed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, dependencies);

  return { value, isLoading, error };
}

export function useHomepageContent() {
  const result = useCancellableLoad(
    true,
    [],
    async (signal) => {
      const [movies, shows, releases] = await Promise.all([
        fetchTmdbListOrEmpty("/movie/popular", apiKey(), signal),
        fetchTmdbListOrEmpty("/tv/popular", apiKey(), signal),
        fetchTmdbListOrEmpty("/movie/now_playing", apiKey(), signal)
      ]);
      const popularMovies = cardsFromList(movies, "movie");
      const popularTv = cardsFromList(shows, "tv");
      const newReleases = cardsFromList(releases, "movie");
      const featured = await Promise.all(
        [...popularMovies.slice(0, 2), ...popularTv.slice(0, 2)].map(
          async (card): Promise<ContentFeatured | null> => {
            const detail = await fetchTmdbDetails(card.tmdbId ?? "", card.type, apiKey(), signal);
            return detail
              ? ({
                  ...card,
                  ...detail,
                  backdropUrl: detail.backdropUrl || card.posterUrl,
                  trending: true
                } satisfies ContentFeatured)
              : null;
          }
        )
      );
      return {
        featured: featured.filter((item): item is ContentFeatured => item !== null),
        categories: [
          { id: "movies", title: "Popular Movies", content: popularMovies },
          { id: "tvshows", title: "Popular TV Shows", content: popularTv },
          { id: "new", title: "New Releases", content: newReleases }
        ]
      };
    },
    undefined,
    "homepage-content-v1"
  );
  return result.value;
}

export function useNewReleases() {
  return useCancellableLoad(
    true,
    [],
    async (signal) =>
      cardsFromList(await fetchTmdbListOrEmpty("/movie/now_playing", apiKey(), signal), "movie"),
    undefined,
    "new-releases-v1"
  ).value;
}

export function useCuratedPicks() {
  const [picks, setPicks] = useState<{
    movies: ContentCard[];
    tv: ContentCard[];
    anime: ContentCard[];
    isLoading: boolean;
  }>({ movies: [], tv: [], anime: [], isLoading: true });
  useEffect(() => {
    const controller = new AbortController();
    const groups = [
      ["movies", sortOwnerPicksByRank(ownersPicksData.movies as OwnerPickItem[]), "movie"],
      ["tv", sortOwnerPicksByRank(ownersPicksData.tv as OwnerPickItem[]), "tv"],
      ["anime", sortOwnerPicksByRank(ownersPicksData.anime as OwnerPickItem[]), "tv"]
    ] as const;
    void Promise.all(
      groups.map(async ([group, items, type]) => {
        const cards = (
          await Promise.all(
            items.map(async (item) => {
              const key = `${type}:${item.tmdbId}`;
              let providerCard = curatedCache.get(key);
              if (!providerCard) {
                providerCard =
                  (await fetchTmdbCardDetail(item.tmdbId, type, apiKey(), controller.signal)) ??
                  undefined;
                if (providerCard) curatedCache.set(key, providerCard);
              }
              return providerCard ? cardFromTmdb(providerCard) : null;
            })
          )
        ).filter((item): item is ContentCard => item !== null);
        return [group, cards] as const;
      })
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        setPicks({
          movies: results.find(([key]) => key === "movies")?.[1] ?? [],
          tv: results.find(([key]) => key === "tv")?.[1] ?? [],
          anime: results.find(([key]) => key === "anime")?.[1] ?? [],
          isLoading: false
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPicks((current) => ({ ...current, isLoading: false }));
      });
    return () => controller.abort();
  }, []);
  return picks;
}

export function useContentPlaybackByTmdbId(tmdbId: string | undefined, typeHint?: TMDBMediaType) {
  const result = useCancellableLoad<ContentPlayback | null | undefined>(
    !!tmdbId,
    [tmdbId, typeHint],
    async (signal) => {
      if (tmdbId?.startsWith("tt")) {
        const resolvedTmdbId = await fetchTmdbIdByImdbId(
          tmdbId,
          typeHint ?? "tv",
          apiKey(),
          signal
        );
        if (!resolvedTmdbId) return null;
        tmdbId = resolvedTmdbId;
      }
      if (isBlockedContent({ tmdbId, type: typeHint })) return null;
      for (const type of typeHint ? [typeHint] : (["movie", "tv"] as const)) {
        const detail = await fetchTmdbFullDetail(tmdbId!, type, apiKey(), signal);
        if (detail && !isBlockedContent({ tmdbId: detail.tmdbId, type, imdbId: detail.imdbId }))
          return {
            _id: makeContentId(type, detail.tmdbId),
            title: detail.title,
            type,
            genre: detail.genre,
            year: detail.year,
            posterUrl: detail.posterUrl,
            voteAverage: detail.voteAverage,
            tmdbId: detail.tmdbId,
            imdbId: detail.imdbId,
            originalLanguage: detail.originalLanguage,
            seasons: detail.seasons,
            hasSpecials: detail.hasSpecials
          } satisfies ContentPlayback;
      }
      return null;
    },
    undefined,
    tmdbId ? `playback:${typeHint ?? "auto"}:${tmdbId}` : undefined
  );
  return tmdbId ? result.value : null;
}

export function useRelatedContent(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  limit = 10,
  enabled = true
) {
  const result = useCancellableLoad(
    enabled && tmdbId !== undefined && type !== undefined,
    [tmdbId, type, limit, enabled],
    (signal) =>
      tmdbId === undefined || type === undefined
        ? Promise.resolve([])
        : fetchTmdbRelated(tmdbId, type, apiKey(), limit, signal).then((items) =>
            items.filter((item) => !isBlockedContent({ tmdbId: item.tmdbId, type: item.type }))
          ),
    [] as TMDBItem[],
    tmdbId !== undefined && type !== undefined ? `related:${type}:${tmdbId}:${limit}` : undefined
  );
  return { related: result.value, isLoading: result.isLoading };
}

export function useContentCredits(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  enabled = true
) {
  const result = useCancellableLoad(
    enabled && tmdbId !== undefined && type !== undefined,
    [tmdbId, type, enabled],
    (signal) =>
      tmdbId === undefined || type === undefined
        ? Promise.resolve(null)
        : fetchTmdbCredits(tmdbId, type, apiKey(), signal),
    null as TMDBCreditResult | null,
    tmdbId !== undefined && type !== undefined ? `credits:${type}:${tmdbId}` : undefined
  );
  return { credits: result.value, isLoading: result.isLoading };
}

export function useContentVideos(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  enabled = true
) {
  const result = useCancellableLoad(
    enabled && tmdbId !== undefined && type !== undefined,
    [tmdbId, type, enabled],
    (signal) =>
      tmdbId === undefined || type === undefined
        ? Promise.resolve([])
        : fetchTmdbVideos(tmdbId, type, apiKey(), signal),
    [] as TMDBVideoResult[],
    tmdbId !== undefined && type !== undefined ? `videos:${type}:${tmdbId}` : undefined
  );
  return { videos: result.value, isLoading: result.isLoading };
}

export function useSearchAll(query: string) {
  const normalized = query.trim();
  const [results, setResults] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const moreController = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    moreController.current?.abort();
    if (!normalized) {
      setResults([]);
      setPage(0);
      setTotalPages(0);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    const timer = window.setTimeout(
      () =>
        void fetchTmdbSearch(normalized, apiKey(), controller.signal, 1)
          .then((data) => {
            if (current !== generation.current) return;
            setResults(
              [...data.movies, ...data.shows].filter(
                (item) => !isBlockedContent({ tmdbId: item.tmdbId, type: item.type })
              )
            );
            setPage(1);
            setTotalPages(Math.max(data.movieTotalPages, data.showTotalPages));
          })
          .catch((reason: unknown) => {
            if (!controller.signal.aborted && current === generation.current)
              setError(message(reason, "Search failed"));
          })
          .finally(() => {
            if (!controller.signal.aborted && current === generation.current) setLoading(false);
          }),
      350
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized]);
  const loadMore = useCallback(async () => {
    if (!normalized || loading || loadingMore || page >= totalPages) return;
    const current = generation.current;
    const controller = new AbortController();
    moreController.current?.abort();
    moreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchTmdbSearch(normalized, apiKey(), controller.signal, page + 1);
      if (current === generation.current) {
        setResults((old) => [
          ...old,
          ...[...data.movies, ...data.shows].filter(
            (item) => !isBlockedContent({ tmdbId: item.tmdbId, type: item.type })
          )
        ]);
        setPage((old) => old + 1);
        setTotalPages(Math.max(data.movieTotalPages, data.showTotalPages));
      }
    } catch (reason: unknown) {
      if (!controller.signal.aborted && current === generation.current)
        setError(message(reason, "Search failed"));
    } finally {
      if (current === generation.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, normalized, page, totalPages]);
  return {
    results,
    loading,
    loadingMore,
    canLoadMore: page > 0 && page < totalPages,
    loadMore,
    error
  };
}

export function usePaginatedContent(
  type: TMDBMediaType,
  genre: string | null | undefined,
  sortBy: ContentSort | AnimeSort,
  limit = 24,
  page = 1,
  source: "tmdb" | "imdb" | "anime" = "tmdb",
  animeMedia: AnimeMediaFilter = "all"
): BrowsePageResult {
  const [result, setResult] = useState<BrowsePageResult>({
    items: [],
    currentPage: page,
    hasNextPage: false,
    canGoBack: page > 1,
    isLoading: true
  });
  useEffect(() => {
    const controller = new AbortController();
    if (genre === null) {
      setResult({
        items: [],
        currentPage: page,
        hasNextPage: false,
        canGoBack: false,
        isLoading: false
      });
      return () => controller.abort();
    }
    setResult((old) => ({ ...old, currentPage: page, isLoading: true }));
    const load = async () => {
      if (source === "anime") {
        const data = await fetchAnimeCatalogPage({
          genre: genre ?? undefined,
          media: animeMedia,
          page,
          sort: sortBy as AnimeSort,
          signal: controller.signal
        });
        return { items: data.items, totalPages: data.totalPages, totalResults: data.totalResults };
      }
      if (source === "imdb") {
        const data = await fetchImdbDiscover(type, imdbRequest, controller.signal, {
          page,
          sortBy: sortBy as ContentSort,
          genres: genre?.split(",")
        });
        const items = data.items.map(
          (item): ContentCard =>
            ({
              _id: makeContentId(type, item.imdbId),
              title: item.title,
              type,
              genre: item.genre,
              year: item.year,
              voteAverage: item.voteAverage,
              posterUrl: item.posterUrl,
              imdbId: item.imdbId,
              new: item.isNew
            }) satisfies ContentCard
        );
        return { items, totalPages: data.totalPages, totalResults: data.totalResults };
      }

      const data = await fetchTmdbDiscover(type, apiKey(), controller.signal, {
        page,
        sortBy: sortBy as ContentSort,
        genreId: genre
          ?.split(",")
          .map((name) => {
            const normalized = name.trim().toLowerCase();
            return (type === "tv" ? TMDB_TV_DISCOVER_GENRES : TMDB_DISCOVER_GENRES)[normalized];
          })
          .filter((id): id is number => id !== undefined)
          .join(","),
        minVoteCount: sortBy === "rating" ? 100 : 25
      });
      return {
        items: data.items
          .filter((item) => !isBlockedContent({ tmdbId: item.tmdbId, type: item.type }))
          .map(cardFromTmdb)
          .filter((item): item is ContentCard => item !== null),
        totalPages: data.totalPages,
        totalResults: data.totalResults
      };
    };

    void load()
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({
            items: data.items.slice(0, Math.max(0, limit)),
            currentPage: page,
            totalPages: data.totalPages,
            totalCount: data.totalResults,
            hasNextPage: page < data.totalPages,
            canGoBack: page > 1,
            isLoading: false
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult((old) => ({ ...old, isLoading: false }));
      });
    return () => controller.abort();
  }, [animeMedia, genre, limit, page, sortBy, source, type]);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAnimeCatalogResponse(value: unknown): AnimeCatalogApiResponse {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new Error("Invalid Anime catalog response");
  const items = value.items.flatMap((item): ContentCard[] => {
    if (!isRecord(item)) return [];
    const { type, tmdbId, title, posterUrl, year } = item;
    if (
      (type !== "movie" && type !== "tv") ||
      typeof tmdbId !== "string" ||
      typeof title !== "string" ||
      typeof posterUrl !== "string" ||
      typeof year !== "number"
    )
      return [];
    return [
      {
        _id: makeContentId(type, tmdbId),
        title,
        type,
        genre: Array.isArray(item.genre)
          ? item.genre.filter((value): value is string => typeof value === "string")
          : [],
        year,
        posterUrl,
        tmdbId,
        voteAverage: typeof item.voteAverage === "number" ? item.voteAverage : undefined,
        releaseDate: typeof item.releaseDate === "string" ? item.releaseDate : undefined,
        popularity: typeof item.popularity === "number" ? item.popularity : undefined,
        new: false
      }
    ];
  });
  return {
    items,
    totalPages: typeof value.totalPages === "number" ? value.totalPages : 1,
    totalResults: typeof value.totalResults === "number" ? value.totalResults : items.length
  };
}

async function fetchAnimeCatalogPage(args: {
  genre?: string;
  media: AnimeMediaFilter;
  page: number;
  sort: AnimeSort;
  signal: AbortSignal;
}): Promise<AnimeCatalogApiResponse> {
  const params = new URLSearchParams({
    media: args.media,
    page: String(args.page),
    sort: args.sort
  });
  if (args.genre) params.set("genre", args.genre);
  const response = await fetch(`/api/anime?${params}`, { signal: args.signal });
  if (!response.ok) throw new Error(`Anime catalog failed (${response.status})`);
  return parseAnimeCatalogResponse(await response.json());
}

export interface AnimeBrowseResult {
  items: ContentCard[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasNextPage: boolean;
  error: string | null;
  loadMore: () => void;
}

function mergeAnimeItems(current: ContentCard[], next: ContentCard[]) {
  const seen = new Set(current.map((item) => item._id));
  return [
    ...current,
    ...next.filter((item) => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    })
  ];
}

export function useAnimeBrowseContent(
  genre: string | undefined,
  media: AnimeMediaFilter,
  sortBy: AnimeSort
): AnimeBrowseResult {
  const [allItems, setAllItems] = useState<ContentCard[]>([]);
  const [visibleCount, setVisibleCount] = useState(32);
  const [loadedPage, setLoadedPage] = useState(2);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const loadMoreGeneration = useRef<number | null>(null);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    setAllItems([]);
    setVisibleCount(32);
    setLoadedPage(2);
    setTotalPages(1);
    setIsLoading(true);
    setError(null);

    void Promise.all(
      [1, 2].map((page) =>
        fetchAnimeCatalogPage({
          page,
          media,
          sort: sortBy,
          genre,
          signal: controller.signal
        })
      )
    )
      .then((responses) => {
        if (controller.signal.aborted || currentGeneration !== generation.current) return;
        const items = responses.reduce(
          (merged, response) => mergeAnimeItems(merged, response.items),
          [] as ContentCard[]
        );
        setAllItems(items);
        setTotalPages(Math.max(...responses.map((response) => response.totalPages)));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && currentGeneration === generation.current)
          setError(message(reason, "Anime catalog failed"));
      })
      .finally(() => {
        if (!controller.signal.aborted && currentGeneration === generation.current)
          setIsLoading(false);
      });

    return () => controller.abort();
  }, [genre, media, sortBy]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore || loadMoreGeneration.current === generation.current) return;
    if (visibleCount < allItems.length) {
      setVisibleCount((current) => current + 32);
      return;
    }
    if (loadedPage >= totalPages) return;

    const currentGeneration = generation.current;
    const controller = new AbortController();
    loadMoreGeneration.current = currentGeneration;
    setIsLoadingMore(true);
    void fetchAnimeCatalogPage({
      page: loadedPage + 1,
      media,
      sort: sortBy,
      genre,
      signal: controller.signal
    })
      .then((response) => {
        if (currentGeneration !== generation.current) return;
        setAllItems((current) => mergeAnimeItems(current, response.items));
        setLoadedPage((current) => current + 1);
        setTotalPages((current) => Math.max(current, response.totalPages));
        setVisibleCount((current) => current + 32);
      })
      .catch((reason: unknown) => {
        if (currentGeneration === generation.current)
          setError(message(reason, "Anime catalog failed"));
      })
      .finally(() => {
        if (currentGeneration === generation.current) {
          loadMoreGeneration.current = null;
          setIsLoadingMore(false);
        }
      });
  }, [
    allItems.length,
    genre,
    isLoading,
    isLoadingMore,
    loadedPage,
    media,
    sortBy,
    totalPages,
    visibleCount
  ]);

  const items = allItems.slice(0, visibleCount);
  return {
    items,
    isLoading,
    isLoadingMore,
    hasNextPage: visibleCount < allItems.length || loadedPage < totalPages,
    error,
    loadMore
  };
}

export function usePersonalizedRecommendationSeed(enabled = true, refreshSeed = 0) {
  const history = useMyWatchHistory();
  const continueWatching = useContinueWatching(enabled, 20);
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const { scope } = useRecommendationFolderScope(user?.id ?? "guest");
  const bookmarkSeeds = useQuery(
    api.domains.bookmark.bookmark.listRecommendationSeeds,
    enabled && user && isAuthenticated
      ? {
          ...(scope.folder ? { folder: scope.folder } : {})
        }
      : "skip"
  );
  return useMemo(() => {
    if (enabled && user && bookmarkSeeds === undefined) {
      return { tmdbSeeds: [], preferredType: "movie" as TMDBMediaType, genres: [] };
    }
    const bookmark = bookmarkSeeds ?? [];
    const weights = new Map<string, number>();
    const genres = new Map<string, number>();
    const seeds = new Map<string, RecommendationSeed>();
    const add = (
      item: { tmdbId?: string; type: TMDBMediaType; genre?: string[] },
      weight: number,
      source: RecommendationSeedSource
    ) => {
      if (!isTmdbId(item.tmdbId)) return;
      const key = `${item.type}:${item.tmdbId}`;
      weights.set(key, (weights.get(key) ?? 0) + weight);
      const existing = seeds.get(key);
      const sourcePriority: Record<RecommendationSeedSource, number> = {
        continue: 3,
        bookmark: 2,
        history: 1
      };
      seeds.set(key, {
        tmdbId: item.tmdbId,
        type: item.type,
        genres: item.genre,
        weight: (existing?.weight ?? 0) + weight,
        source:
          existing?.source && sourcePriority[existing.source] > sourcePriority[source]
            ? existing.source
            : source
      });
      for (const genre of item.genre ?? []) genres.set(genre, (genres.get(genre) ?? 0) + weight);
    };
    const shuffledBookmark = shuffleWithSeed(bookmark, refreshSeed * 7919 + 17);
    if (scope.folder === null)
      shuffleWithSeed(continueWatching ?? [], refreshSeed * 6151 + 31)
        .slice(0, 24)
        .forEach((item, index) => add(item, Math.max(0.5, 1 - index * 0.05), "continue"));
    shuffledBookmark
      .slice(0, 20)
      .forEach((item, index) => add(item, 7 * Math.max(0.3, 1 - index * 0.02), "bookmark"));
    if (scope.folder === null)
      shuffleWithSeed(history ?? [], refreshSeed * 4513 + 47)
        .slice(0, 48)
        .forEach((item, index) => add(item, Math.max(0.1, 1 - index * 0.01), "history"));
    const ordered = [...seeds.entries()]
      .sort((a, b) => (weights.get(b[0]) ?? 0) - (weights.get(a[0]) ?? 0))
      .map(([, seed]) => seed);
    const typeWeights = new Map<TMDBMediaType, number>();
    for (const [key, weight] of weights) {
      const type = seeds.get(key)?.type;
      if (type) typeWeights.set(type, (typeWeights.get(type) ?? 0) + weight);
    }
    return {
      tmdbSeeds: ordered,
      preferredType:
        (typeWeights.get("tv") ?? 0) > (typeWeights.get("movie") ?? 0) ? "tv" : "movie",
      genres: [...genres.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([genre]) => genre)
    };
  }, [continueWatching, enabled, history, refreshSeed, scope, user, bookmarkSeeds]);
}

const REC_CACHE = "fishy_recs_cache_v3";
const RECENT_RECOMMENDATIONS = "fishy_recent_recommendations_v2";
type CacheEntry = { timestamp: number; cards: ContentCard[] };
type Cache = Record<string, CacheEntry>;
function isCachedCard(value: unknown): value is ContentCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card._id === "string" &&
    typeof card.title === "string" &&
    (card.type === "movie" || card.type === "tv") &&
    typeof card.posterUrl === "string" &&
    typeof card.new === "boolean"
  );
}
function readCache(): Cache {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REC_CACHE) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const cache: Cache = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const candidate = entry as { timestamp?: unknown; cards?: unknown };
      if (typeof candidate.timestamp !== "number" || !Array.isArray(candidate.cards)) continue;
      const cards = candidate.cards
        .filter(isCachedCard)
        .filter((card) => !isBlockedContent({ tmdbId: card.tmdbId, type: card.type }));
      if (cards.length) cache[key] = { timestamp: candidate.timestamp, cards };
    }
    return cache;
  } catch {
    return {};
  }
}
function writeCache(value: Cache): void {
  try {
    localStorage.setItem(REC_CACHE, JSON.stringify(value));
  } catch {
    /* optional */
  }
}

function readRecentRecommendations(): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_RECOMMENDATIONS) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        Array.isArray(entry)
          ? [[key, entry.filter((item): item is string => typeof item === "string")]]
          : []
      )
    );
  } catch {
    return {};
  }
}

function writeRecentRecommendations(value: Record<string, string[]>): void {
  try {
    localStorage.setItem(RECENT_RECOMMENDATIONS, JSON.stringify(value));
  } catch {
    /* optional */
  }
}

export function useRecommendations(
  limit = 12,
  typeFilter: "all" | TMDBMediaType = "all",
  refreshSeed = 0,
  enabled = true,
  seed?: { tmdbSeeds?: RecommendationSeed[]; preferredType: TMDBMediaType; genres: string[] }
) {
  const personal = usePersonalizedRecommendationSeed(enabled, refreshSeed);
  const active = seed ?? personal;
  const [recommendations, setRecommendations] = useState<ContentCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const signature = active.tmdbSeeds?.map(cardKey).sort().join("|") ?? "default";
  const genreSignature = active.genres.map((genre) => genre.toLowerCase()).join("|");
  const preferenceSignature = `${active.preferredType}:${genreSignature}`;
  useEffect(() => {
    if (!enabled) {
      setRecommendations([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const seeds = (active.tmdbSeeds ?? [])
      .filter((item) => typeFilter === "all" || item.type === typeFilter)
      .filter((item) => isTmdbId(item.tmdbId))
      .slice(0, 160);
    setIsLoading(true);
    const cache = readCache();
    const recent = readRecentRecommendations();
    const rotationKey = `${signature}:${typeFilter}`;
    const recentCount = recent[rotationKey]?.length ?? 0;
    const loadSeed = async (seedItem: RecommendationSeed) => {
      const key = `${seedItem.type}:${seedItem.tmdbId}`;
      const cached = cache[key];
      const excludedIds = new Set(active.tmdbSeeds?.map(cardKey));
      if (cached && Date.now() - cached.timestamp < 6 * 60 * 60 * 1000) {
        return cached.cards.filter((card) => !excludedIds.has(cardKey(card)));
      }
      const responses = await Promise.all([
        fetchTmdbListOrEmpty(
          `/${seedItem.type}/${seedItem.tmdbId}/recommendations`,
          apiKey(),
          controller.signal
        ),
        fetchTmdbListOrEmpty(
          `/${seedItem.type}/${seedItem.tmdbId}/similar`,
          apiKey(),
          controller.signal
        )
      ]);
      const cards = collectTmdbCards(
        responses.map((data) => ({ data, type: seedItem.type })),
        { typeFilter, excludedIds }
      )
        .map(cardFromTmdb)
        .filter((card): card is ContentCard => card !== null);
      cache[key] = { timestamp: Date.now(), cards };
      return cards;
    };
    void (async () => {
      const groups: ContentCard[][] = [];
      const candidates = new Map<string, ContentCard>();
      const targetCandidateCount = Math.max(limit * 4, 96, recentCount + limit);
      for (let index = 0; index < seeds.length; index += 8) {
        const batch = await Promise.all(seeds.slice(index, index + 8).map(loadSeed));
        for (const cards of batch) {
          groups.push(cards);
          for (const card of cards) candidates.set(cardKey(card), card);
        }
        writeCache(cache);
        if (candidates.size >= targetCandidateCount) break;
      }
      return groups;
    })()
      .then((groups) => {
        if (controller.signal.aborted) return;
        const unique = [...new Map(groups.flat().map((card) => [cardKey(card), card])).values()];
        const preferredGenres = new Set(active.genres.map((genre) => genre.toLowerCase()));
        const ordered = shuffleWithSeed(unique, refreshSeed).sort((left, right) => {
          const score = (card: ContentCard) => {
            const genreScore = (card.genre ?? []).filter((genre) =>
              preferredGenres.has(genre.toLowerCase())
            ).length;
            const typeScore = card.type === active.preferredType ? 1 : 0;
            return genreScore * 10 + typeScore + (card.voteAverage ?? 0) / 100;
          };
          return score(right) - score(left);
        });
        const selected = selectFreshRecommendations(
          ordered,
          Math.max(0, limit),
          recent[rotationKey] ?? [],
          cardKey,
          refreshSeed * 1009 + Date.now()
        );
        recent[rotationKey] = selected.recentKeys;
        writeRecentRecommendations(recent);
        setRecommendations(selected.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendations([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [enabled, limit, preferenceSignature, refreshSeed, signature, typeFilter]);
  return { recommendations, isLoading };
}

export function useContentDetail(
  tmdbId: string | undefined,
  type: TMDBMediaType | undefined,
  enabled = true,
  includeImdb = true
) {
  const result = useCancellableLoad(
    enabled && !!tmdbId && !!type,
    [enabled, includeImdb, tmdbId, type],
    async (signal) => {
      if (!tmdbId || !type) return null;
      const resolvedTmdbId = tmdbId.startsWith("tt")
        ? await fetchTmdbIdByImdbId(tmdbId, type, apiKey(), signal)
        : tmdbId;
      if (!resolvedTmdbId || isBlockedContent({ tmdbId: resolvedTmdbId, type })) return null;
      const tmdb = await fetchTmdbFullDetail(resolvedTmdbId, type, apiKey(), signal);
      if (!tmdb || isBlockedContent({ tmdbId: tmdb.tmdbId, type, imdbId: tmdb.imdbId }))
        return null;
      const imdb =
        includeImdb && tmdb.imdbId
          ? await fetchImdbFullDetail(tmdb.imdbId, type, imdbRequest, signal)
          : null;
      return {
        ...tmdb,
        seasons:
          type === "tv" ? Math.max(tmdb.seasons ?? 0, imdb?.seasons ?? 0) || undefined : undefined,
        imdbId: imdb?.imdbId ?? tmdb.imdbId,
        rating: imdb?.rating ?? tmdb.rating,
        voteAverage: imdb?.voteAverage ?? tmdb.voteAverage
      };
    },
    undefined as TMDBFullDetail | null | undefined,
    tmdbId && type ? `detail:${type}:${tmdbId}:${includeImdb ? "imdb" : "tmdb"}` : undefined
  );
  return { detail: result.value, isLoading: result.isLoading };
}

type Season = {
  overview?: string;
  episodes: Array<{
    episodeNumber: number;
    displayEpisodeNumber?: number;
    name: string;
    overview?: string;
    stillUrl?: string;
    runtime?: number;
    voteAverage: number;
    fillerStatus: "filler" | "not_filler" | "unknown";
  }>;
};
export function useSeasonEpisodes(
  tmdbId: string | undefined,
  seasonNumber: number,
  enabled = true,
  imdbId?: string,
  animeTitle?: string,
  animeYear?: number,
  isAnime = false,
  loadImdbRatings = true
) {
  const [season, setSeason] = useState<Season | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [fillerLoading, setFillerLoading] = useState(false);
  const fillerWindows = useRef(new Set<string>());
  const fillerRequests = useRef(new Set<string>());
  const ratings = useRef(new Map<number, number>());
  useEffect(() => {
    if (!enabled || !tmdbId) {
      setSeason(undefined);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const cacheKey = `season:${tmdbId}:${seasonNumber}`;
    if (queryCache.has(cacheKey)) {
      setSeason(queryCache.get(cacheKey) as Season | null);
      setIsLoading(false);
      return () => controller.abort();
    }
    setSeason(undefined);
    setIsLoading(true);
    ratings.current.clear();
    void fetchTmdbSeasonEpisodes(tmdbId, seasonNumber, apiKey(), controller.signal)
      .then(async (value) => {
        if (!controller.signal.aborted) {
          if (value?.episodes.length) {
            const firstEpisodeNumber = value.episodes[0]?.episodeNumber ?? 1;
            const next = {
              overview: value.overview,
              episodes: value.episodes.map((episode) => ({
                ...episode,
                episodeNumber:
                  firstEpisodeNumber > 1
                    ? episode.episodeNumber - firstEpisodeNumber + 1
                    : episode.episodeNumber,
                displayEpisodeNumber: firstEpisodeNumber > 1 ? episode.episodeNumber : undefined,
                voteAverage: ratings.current.get(episode.episodeNumber) ?? 0,
                fillerStatus: "unknown" as const
              }))
            };
            queryCache.set(cacheKey, next);
            setSeason(next);
            return;
          }

          const imdbSeason = imdbId
            ? await fetchImdbSeasonEpisodes(imdbId, seasonNumber, imdbRequest, controller.signal)
            : null;
          if (!imdbSeason?.episodes.length) {
            queryCache.set(cacheKey, null);
            setSeason(null);
            return;
          }

          const previousSeason =
            seasonNumber > 1 && imdbId
              ? await fetchImdbSeasonEpisodes(
                  imdbId,
                  seasonNumber - 1,
                  imdbRequest,
                  controller.signal
                )
              : null;
          const episodeOffset = previousSeason?.episodes.length ?? 0;
          const next = {
            overview: imdbSeason.overview,
            episodes: imdbSeason.episodes.map((episode) => ({
              ...episode,
              overview: episode.overview ?? undefined,
              displayEpisodeNumber: episode.episodeNumber + episodeOffset,
              voteAverage: ratings.current.get(episode.episodeNumber) ?? 0,
              fillerStatus: "unknown" as const
            }))
          };
          queryCache.set(cacheKey, next);
          setSeason(next);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeason(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [enabled, imdbId, seasonNumber, tmdbId]);
  useEffect(() => {
    fillerWindows.current.clear();
    fillerRequests.current.clear();
    setFillerLoading(false);
  }, [animeTitle, animeYear, seasonNumber, tmdbId]);
  const loadFillerAround = useCallback(
    (episodeNumber: number) => {
      if (!enabled || !isAnime || !animeTitle || seasonNumber < 1) return;
      const windowSize = 20;
      const windowStart = Math.floor((episodeNumber - 1) / windowSize) * windowSize + 1;
      const windowKey = `${tmdbId}:${seasonNumber}:${windowStart}`;
      if (fillerWindows.current.has(windowKey) || fillerRequests.current.has(windowKey)) return;

      fillerRequests.current.add(windowKey);
      setFillerLoading(true);
      const controller = new AbortController();
      void fetchAnimeFillerEpisodes({
        title: animeTitle,
        season: seasonNumber,
        year: animeYear,
        centerEpisode: episodeNumber,
        windowSize,
        signal: controller.signal
      })
        .then((fillerEpisodes) => {
          if (controller.signal.aborted) return;
          fillerWindows.current.add(windowKey);
          if (!fillerEpisodes) return;
          const fillerByEpisode = new Map(
            fillerEpisodes.map((episode) => [episode.episodeNumber, episode.isFiller])
          );
          setSeason((old) => {
            if (!old) return old;
            const nextSeason = {
              ...old,
              episodes: old.episodes.map((episode) => {
                const isFiller = fillerByEpisode.get(episode.episodeNumber);
                return isFiller === undefined
                  ? episode
                  : {
                      ...episode,
                      fillerStatus: isFiller ? ("filler" as const) : ("not_filler" as const)
                    };
              })
            };
            queryCache.set(`season:${tmdbId}:${seasonNumber}`, nextSeason);
            return nextSeason;
          });
        })
        .catch(() => undefined)
        .finally(() => {
          fillerRequests.current.delete(windowKey);
          setFillerLoading(fillerRequests.current.size > 0);
        });
    },
    [animeTitle, animeYear, enabled, isAnime, seasonNumber, tmdbId]
  );
  useEffect(() => {
    if (!enabled || !imdbId || !loadImdbRatings) return;
    const controller = new AbortController();
    void loadImdbSeasonEpisodes(imdbId, seasonNumber, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        const next = new Map(
          (value?.episodes ?? []).map((episode) => [episode.episodeNumber, episode.voteAverage])
        );
        ratings.current = next;
        setSeason((old) => {
          if (!old) return old;
          const nextSeason = {
            ...old,
            episodes: old.episodes.map((episode) => ({
              ...episode,
              voteAverage: next.get(episode.displayEpisodeNumber ?? episode.episodeNumber) ?? 0
            }))
          };
          queryCache.set(`season:${tmdbId}:${seasonNumber}`, nextSeason);
          return nextSeason;
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, imdbId, loadImdbRatings, seasonNumber]);
  return {
    season,
    isLoading,
    fillerLoading,
    loadFillerAround
  };
}

export function useSeriesEpisodeRatings(
  tmdbId: string | undefined,
  seasonCount: number,
  enabled = true,
  imdbId?: string
) {
  const [seasons, setSeasons] = useState<
    Array<{
      seasonNumber: number;
      episodes: Array<{ episodeNumber: number; name: string; voteAverage: number }>;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !tmdbId || !imdbId || seasonCount < 1) {
      setSeasons([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const cacheKey = `ratings:${tmdbId}:${imdbId}:${seasonCount}`;
    if (queryCache.has(cacheKey)) {
      setSeasons(queryCache.get(cacheKey) as typeof seasons);
      setIsLoading(false);
      return () => controller.abort();
    }
    setIsLoading(true);
    void Promise.all(
      Array.from({ length: seasonCount }, (_, index) => index + 1).map(async (seasonNumber) => ({
        seasonNumber,
        episodes:
          (await loadImdbSeasonEpisodes(imdbId, seasonNumber, controller.signal))?.episodes.map(
            ({ episodeNumber, name, voteAverage }) => ({
              episodeNumber,
              name,
              voteAverage
            })
          ) ?? []
      }))
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          queryCache.set(cacheKey, value);
          setSeasons(value);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeasons([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [enabled, imdbId, seasonCount, tmdbId]);
  return { seasons, isLoading };
}
