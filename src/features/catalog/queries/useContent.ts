import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { useAllMyWatchlist } from "@/features/library/useWatchlist";
import { useContinueWatching, useMyWatchHistory } from "@/features/library/useWatchHistory";
import { useRecommendationFolderScope } from "@/features/catalog/recommendationFolderScope";
import type { ContentCard, ContentFeatured, ContentPlayback } from "@content/contentMetadata";
import { makeContentId } from "@content/contentMetadata";
import {
  TMDB_API_KEY,
  TMDB_DISCOVER_GENRES,
  collectTmdbCards,
  fetchTmdbCardDetail,
  fetchTmdbCredits,
  fetchTmdbDetails,
  fetchTmdbDiscover,
  fetchTmdbFullDetail,
  fetchTmdbListOrEmpty,
  fetchTmdbRelated,
  fetchTmdbSearch,
  fetchTmdbSeasonEpisodes,
  fetchTmdbVideos,
  shuffleWithSeed,
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
  fetchImdbFullDetail,
  fetchImdbSeasonEpisodes
} from "@fishy/providers/imdb";
import ownersPicksData from "../ownersPicks.json";

export type { TMDBItem, TMDBFullDetail };

const imdbRequest = createIMDbProxyRequest("/api/imdb");
const curatedCache = new Map<string, TMDBContentCard>();
const queryCache = new Map<string, unknown>();

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
export type RecommendationSeed = { tmdbId: string; type: TMDBMediaType; genres?: string[] };

function apiKey(): string {
  const configured = import.meta.env.VITE_TMDB_KEY;
  return typeof configured === "string" && configured.trim() ? configured : TMDB_API_KEY;
}

function cardKey(value: Pick<ContentCard, "type" | "tmdbId">): string {
  return `${value.type}:${value.tmdbId ?? ""}`;
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
  return card
    ? {
        _id: makeContentId(card.type, card.tmdbId),
        title: card.title,
        type: card.type,
        genre: card.genre,
        year: card.year,
        voteAverage: card.voteAverage,
        posterUrl: card.posterUrl,
        tmdbId: card.tmdbId,
        new: card.isNew
      }
    : null;
}

function cardFromTmdb(card: TMDBContentCard): ContentCard {
  return {
    _id: makeContentId(card.type, card.tmdbId),
    title: card.title,
    type: card.type,
    genre: card.genre,
    year: card.year,
    voteAverage: card.voteAverage,
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
    undefined
  );
  return result.value;
}

export function useNewReleases() {
  return useCancellableLoad(
    true,
    [],
    async (signal) =>
      cardsFromList(await fetchTmdbListOrEmpty("/movie/now_playing", apiKey(), signal), "movie"),
    undefined
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
      ["movies", ownersPicksData.movies, "movie"],
      ["tv", ownersPicksData.tv, "tv"],
      ["anime", ownersPicksData.anime, "tv"]
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
  const result = useCancellableLoad(
    !!tmdbId,
    [tmdbId, typeHint],
    async (signal) => {
      for (const type of typeHint ? [typeHint] : (["movie", "tv"] as const)) {
        const detail = await fetchTmdbFullDetail(tmdbId!, type, apiKey(), signal);
        if (detail)
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
    undefined as ContentPlayback | null | undefined
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
        : fetchTmdbRelated(tmdbId, type, apiKey(), limit, signal),
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
            setResults([...data.movies, ...data.shows]);
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
        setResults((old) => [...old, ...data.movies, ...data.shows]);
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
  genre: string | undefined,
  sortBy: ContentSort,
  limit = 24,
  page = 1
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
    setResult((old) => ({ ...old, currentPage: page, isLoading: true }));
    void fetchTmdbDiscover(type, apiKey(), controller.signal, {
      page,
      sortBy,
      genreId: genre ? TMDB_DISCOVER_GENRES[genre.toLowerCase()] : undefined,
      minVoteCount: sortBy === "rating" ? 100 : 25
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({
            items: data.items.slice(0, Math.max(0, limit)).map(cardFromTmdb),
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
  }, [genre, limit, page, sortBy, type]);
  return result;
}

export function usePersonalizedRecommendationSeed(enabled = true) {
  const watchlist = useAllMyWatchlist();
  const history = useMyWatchHistory();
  const continueWatching = useContinueWatching(enabled, 24);
  const { user } = useUser();
  const { scope } = useRecommendationFolderScope(user?.id ?? "guest");
  return useMemo(() => {
    const weights = new Map<string, number>();
    const genres = new Map<string, number>();
    const seeds = new Map<string, RecommendationSeed>();
    const add = (
      item: { tmdbId?: string; type: TMDBMediaType; genre?: string[] },
      weight: number
    ) => {
      if (!item.tmdbId) return;
      const key = `${item.type}:${item.tmdbId}`;
      weights.set(key, (weights.get(key) ?? 0) + weight);
      seeds.set(key, { tmdbId: item.tmdbId, type: item.type, genres: item.genre });
      for (const genre of item.genre ?? []) genres.set(genre, (genres.get(genre) ?? 0) + weight);
    };
    const scoped = watchlist?.filter(
      (item) =>
        scope.folders.length === 0 ||
        (scope.mode === "include"
          ? !!item.watchlistFolder && scope.folders.includes(item.watchlistFolder)
          : !item.watchlistFolder || !scope.folders.includes(item.watchlistFolder))
    );
    if (scope.folders.length === 0)
      continueWatching?.forEach((item, index) => add(item, Math.max(0.5, 1 - index * 0.05)));
    scoped?.forEach((item, index) => add(item, 7 * Math.max(0.3, 1 - index * 0.02)));
    if (scope.folders.length === 0)
      history?.forEach((item, index) => add(item, Math.max(0.1, 1 - index * 0.01)));
    const ordered = [...seeds.entries()]
      .sort((a, b) => (weights.get(b[0]) ?? 0) - (weights.get(a[0]) ?? 0))
      .map(([, seed]) => seed);
    return {
      tmdbSeeds: ordered,
      preferredType: "movie" as TMDBMediaType,
      genres: [...genres.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([genre]) => genre)
    };
  }, [continueWatching, history, scope, watchlist]);
}

const REC_CACHE = "fishy_recs_cache_v3";
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
      const cards = candidate.cards.filter(isCachedCard);
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

export function useRecommendations(
  limit = 12,
  typeFilter: "all" | TMDBMediaType = "all",
  refreshSeed = 0,
  enabled = true,
  seed?: { tmdbSeeds?: RecommendationSeed[]; preferredType: TMDBMediaType; genres: string[] }
) {
  const personal = usePersonalizedRecommendationSeed(enabled);
  const active = seed ?? personal;
  const [recommendations, setRecommendations] = useState<ContentCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const signature = active.tmdbSeeds?.map(cardKey).sort().join("|") ?? "default";
  useEffect(() => {
    if (!enabled) {
      setRecommendations([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const seeds = (active.tmdbSeeds ?? [])
      .filter((item) => typeFilter === "all" || item.type === typeFilter)
      .slice(0, 10);
    setIsLoading(true);
    void Promise.all(
      seeds.map(async (seedItem) => {
        const key = `${seedItem.type}:${seedItem.tmdbId}`;
        const cache = readCache();
        const cached = cache[key];
        if (cached && Date.now() - cached.timestamp < 6 * 60 * 60 * 1000) return cached.cards;
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
          { typeFilter, excludedIds: new Set(active.tmdbSeeds?.map(cardKey)) }
        ).map(cardFromTmdb);
        cache[key] = { timestamp: Date.now(), cards };
        writeCache(cache);
        return cards;
      })
    )
      .then((groups) => {
        if (controller.signal.aborted) return;
        const unique = [...new Map(groups.flat().map((card) => [cardKey(card), card])).values()];
        setRecommendations(shuffleWithSeed(unique, refreshSeed).slice(0, Math.max(0, limit)));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendations([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [active.tmdbSeeds, enabled, limit, refreshSeed, signature, typeFilter]);
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
      const tmdb = await fetchTmdbFullDetail(tmdbId, type, apiKey(), signal);
      if (!tmdb) return null;
      const imdb =
        includeImdb && tmdb.imdbId
          ? await fetchImdbFullDetail(tmdb.imdbId, type, imdbRequest, signal)
          : null;
      return {
        ...tmdb,
        imdbId: imdb?.imdbId ?? tmdb.imdbId,
        rating: imdb?.rating ?? tmdb.rating,
        voteAverage: imdb?.voteAverage ?? tmdb.voteAverage
      };
    },
    undefined as TMDBFullDetail | null | undefined
  );
  return { detail: result.value, isLoading: result.isLoading };
}

type Season = {
  overview?: string;
  episodes: Array<{
    episodeNumber: number;
    name: string;
    overview?: string;
    stillUrl?: string;
    runtime?: number;
    voteAverage: number;
  }>;
};
export function useSeasonEpisodes(
  tmdbId: string | undefined,
  seasonNumber: number,
  enabled = true,
  imdbId?: string
) {
  const [season, setSeason] = useState<Season | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
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
      .then((value) => {
        if (!controller.signal.aborted) {
          const next = value
            ? {
                overview: value.overview,
                episodes: value.episodes.map((episode) => ({
                  ...episode,
                  voteAverage: ratings.current.get(episode.episodeNumber) ?? 0
                }))
              }
            : null;
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
  }, [enabled, seasonNumber, tmdbId]);
  useEffect(() => {
    if (!enabled || !imdbId) return;
    const controller = new AbortController();
    void fetchImdbSeasonEpisodes(imdbId, seasonNumber, imdbRequest, controller.signal)
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
              voteAverage: next.get(episode.episodeNumber) ?? 0
            }))
          };
          queryCache.set(`season:${tmdbId}:${seasonNumber}`, nextSeason);
          return nextSeason;
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, imdbId, seasonNumber]);
  return { season, isLoading };
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
          (
            await fetchImdbSeasonEpisodes(imdbId, seasonNumber, imdbRequest, controller.signal)
          )?.episodes.map(({ episodeNumber, name, voteAverage }) => ({
            episodeNumber,
            name,
            voteAverage
          })) ?? []
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
