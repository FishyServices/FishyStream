import { useEffect, useState, useRef, useMemo } from "react";
import { useAllMyWatchlist } from "@/features/library/useWatchlist";
import { useMyWatchHistory, useContinueWatching } from "@/features/library/useWatchHistory";
import { useUser } from "@clerk/react";
import { useRecommendationFolderScope } from "@/features/catalog/recommendationFolderScope";
import type {
  ContentCard,
  ContentId,
  ContentFeatured,
  ContentPlayback
} from "@content/contentMetadata";
import { makeContentId } from "@content/contentMetadata";
import {
  TMDB_DISCOVER_GENRES,
  TMDB_API_KEY,
  shuffleWithSeed,
  fetchTmdbListOrEmpty,
  fetchTmdbCredits,
  fetchTmdbVideos,
  fetchTmdbRelated,
  fetchTmdbDetails,
  fetchTmdbCardDetail,
  fetchTmdbFullDetail,
  fetchTmdbSeasonEpisodes,
  fetchTmdbSearch,
  fetchTmdbDiscover,
  collectTmdbCards,
  toTMDBContentCard,
  type TMDBMediaType,
  type TMDBContentCard,
  type TMDBCreditResult,
  type TMDBVideoResult,
  type TMDBItem,
  type TMDBBrowseListResponse,
  type TMDBFullDetail
} from "@fishy/providers/tmdb";
import {
  createIMDbProxyRequest,
  fetchImdbFullDetail,
  fetchImdbSeasonEpisodes
} from "@fishy/providers/imdb";
import ownersPicksData from "../ownersPicks.json";
import type { ContentCatalogPlayback } from "../model/catalog";

export type { TMDBItem, TMDBFullDetail };

const imdbRequest = createIMDbProxyRequest("/api/imdb");

const playbackCatalog: ContentCatalogPlayback = {
  async getPlayback(id, type, signal) {
    const detail = await fetchTmdbFullDetail(id, type, getApiKey(), signal);
    if (!detail) return null;

    return {
      _id: makeContentId(detail.type, detail.tmdbId),
      title: detail.title,
      type: detail.type,
      genre: detail.genre,
      year: detail.year,
      posterUrl: detail.posterUrl,
      voteAverage: detail.voteAverage,
      tmdbId: detail.tmdbId,
      imdbId: detail.imdbId,
      anilistId: undefined,
      originalLanguage: detail.originalLanguage,
      seasons: detail.seasons,
      hasSpecials: detail.hasSpecials
    };
  }
};

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

type TMDBRecommendationSeed = {
  tmdbId: string;
  type: TMDBMediaType;
  genres?: string[];
};

function clientTmdbContentId(type: TMDBMediaType, tmdbId: number | string): ContentId {
  return makeContentId(type, tmdbId);
}

function toClientContentCard(
  item: Parameters<typeof toTMDBContentCard>[0],
  typeHint?: TMDBMediaType
): ContentCard | null {
  const card = toTMDBContentCard(item, typeHint);
  if (!card) return null;
  return {
    _id: clientTmdbContentId(card.type, card.tmdbId),
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

function tmdbCardToContentCard(card: TMDBContentCard): ContentCard {
  return {
    _id: clientTmdbContentId(card.type, card.tmdbId),
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

function getApiKey(): string {
  return (import.meta.env.VITE_TMDB_KEY as string | undefined) ?? TMDB_API_KEY;
}

const curatedCardCache = new Map<string, TMDBContentCard>();

/* ─── Homepage ───────────────────────────────────────────────────────────────── */

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
    const apiKey = getApiKey();

    async function load() {
      try {
        const [moviesRes, tvRes, newRes] = await Promise.all([
          fetchTmdbListOrEmpty("/movie/popular", apiKey, controller.signal),
          fetchTmdbListOrEmpty("/tv/popular", apiKey, controller.signal),
          fetchTmdbListOrEmpty("/movie/now_playing", apiKey, controller.signal)
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
              const details = await fetchTmdbDetails(
                card.tmdbId!,
                card.type,
                apiKey,
                controller.signal
              );
              if (!details) return null;
              return {
                ...card,
                description: details.description,
                backdropUrl: details.backdropUrl || card.posterUrl,
                rating: details.rating,
                logoUrl: details.logoUrl,
                trailerKey: details.trailerKey,
                duration: details.duration,
                seasons: details.seasons,
                hasSpecials: details.hasSpecials,
                trending: true,
                tagline: details.tagline,
                originalLanguage: details.originalLanguage
              } as ContentFeatured;
            } catch {
              return null;
            }
          })
        );

        if (!controller.signal.aborted) {
          setHomepage({
            featured: featuredDetails.filter((item): item is ContentFeatured => !!item),
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

/* ─── New releases ───────────────────────────────────────────────────────────── */

export function useNewReleases() {
  const [newReleases, setNewReleases] = useState<ContentCard[] | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetchTmdbListOrEmpty(
          "/movie/now_playing",
          getApiKey(),
          controller.signal
        );
        const cards = (res.results ?? [])
          .map((item) => toClientContentCard(item, "movie"))
          .filter((item): item is ContentCard => !!item);

        if (!controller.signal.aborted) setNewReleases(cards);
      } catch {
        if (!controller.signal.aborted) setNewReleases([]);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return newReleases;
}

export function useCuratedPicks() {
  const [picks, setPicks] = useState<{
    movies: ContentCard[];
    tv: ContentCard[];
    anime: ContentCard[];
    isLoading: boolean;
  }>({
    movies: [],
    tv: [],
    anime: [],
    isLoading: true
  });

  useEffect(() => {
    const controller = new AbortController();
    const apiKey = getApiKey();

    const movieItems = [...ownersPicksData.movies];
    const tvItems = [...ownersPicksData.tv];
    const animeItems = [...ownersPicksData.anime];

    const movieIds = movieItems.map((item) => item.tmdbId);
    const tvIds = tvItems.map((item) => item.tmdbId);
    const animeIds = animeItems.map((item) => item.tmdbId);

    const cardCache = curatedCardCache;

    async function load() {
      const fetchGroup = async (
        ids: string[],
        type: TMDBMediaType,
        group: "movies" | "tv" | "anime"
      ) => {
        const results = await Promise.all(
          ids.map(async (id) => {
            const key = `${type}:${id}`;
            let card: TMDBContentCard | null | undefined = cardCache.get(key);
            if (card === undefined) {
              card = await fetchTmdbCardDetail(id, type, apiKey, controller.signal);
              if (card) cardCache.set(key, card);
            }
            if (!card) return null;
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
            } as ContentCard;
          })
        );
        if (!controller.signal.aborted) {
          setPicks((current) => ({
            ...current,
            [group]: results.filter((item): item is ContentCard => !!item),
            isLoading: false
          }));
        }
      };

      void fetchGroup(movieIds, "movie", "movies");
      void fetchGroup(tvIds, "tv", "tv");
      void fetchGroup(animeIds, "tv", "anime");
    }

    void load();
    return () => controller.abort();
  }, []);

  return picks;
}

/* Playback */

export function useContentPlaybackByTmdbId(tmdbId: string | undefined, typeHint?: TMDBMediaType) {
  const [content, setContent] = useState<ContentPlayback | null | undefined>(undefined);

  useEffect(() => {
    if (!tmdbId) {
      setContent(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setContent(undefined);

    async function load() {
      const types: TMDBMediaType[] = typeHint ? [typeHint] : ["movie", "tv"];
      for (const type of types) {
        const playback = await playbackCatalog.getPlayback(tmdbId!, type, controller.signal);
        if (!playback) continue;
        if (cancelled) return;
        setContent(playback);
        return;
      }
      if (!cancelled) setContent(null);
    }

    void load().catch(() => {
      if (!cancelled) setContent(null);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tmdbId, typeHint]);

  return content;
}

/* ─── Related / Credits / Videos ────────────────────────────────────────────── */

export function useRelatedContent(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  limit = 10,
  enabled = true
) {
  const [related, setRelated] = useState<TMDBItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setRelated([]);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetchTmdbRelated(tmdbId, type, getApiKey(), limit, controller.signal);
        if (!cancelRef.current) setRelated(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 100);
    return () => {
      clearTimeout(t);
      controller.abort();
      cancelRef.current = true;
    };
  }, [tmdbId, type, limit, enabled]);

  return { related, isLoading };
}

export function useContentCredits(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  enabled = true
) {
  const [credits, setCredits] = useState<TMDBCreditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setCredits(null);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetchTmdbCredits(tmdbId, type, getApiKey(), controller.signal);
        if (!cancelRef.current) setCredits(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled]);

  return { credits, isLoading };
}

export function useContentVideos(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  enabled = true
) {
  const [videos, setVideos] = useState<TMDBVideoResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setVideos([]);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetchTmdbVideos(tmdbId, type, getApiKey(), controller.signal);
        if (!cancelRef.current) setVideos(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled]);

  return { videos, isLoading };
}

/* ─── Search ─────────────────────────────────────────────────────────────────── */

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
        const { movies, shows } = await fetchTmdbSearch(query, getApiKey(), controller.signal);
        if (!controller.signal.aborted) setResults([...movies, ...shows]);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return { results, loading, error };
}

/* ─── Browse ─────────────────────────────────────────────────────────────────── */

export type ContentSort = "trending" | "popular" | "new" | "rating" | "year";

export function usePaginatedContent(
  type: TMDBMediaType,
  genre: string | undefined,
  sortBy: ContentSort,
  _limit = 24,
  page = 1
): BrowsePageResult {
  const [result, setResult] = useState<Omit<BrowsePageResult, "goNext" | "goPrevious">>({
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
        const { items, totalPages, totalResults } = await fetchTmdbDiscover(
          type,
          getApiKey(),
          controller.signal,
          { page, sortBy, genreId, minVoteCount: sortBy === "rating" ? 100 : 25 }
        );

        if (!controller.signal.aborted) {
          setResult({
            items: items.map(tmdbCardToContentCard),
            currentPage: page,
            totalPages,
            totalCount: totalResults,
            hasNextPage: page < totalPages,
            canGoBack: page > 1,
            isLoading: false
          });
        }
      } catch {
        if (!controller.signal.aborted) setResult((prev) => ({ ...prev, isLoading: false }));
      }
    }

    void load();
    return () => controller.abort();
  }, [type, genre, sortBy, page]);

  return { ...result, goNext: () => {}, goPrevious: () => {} };
}

export function usePersonalizedRecommendationSeed(enabled = true) {
  const watchlist = useAllMyWatchlist();
  const watchHistory = useMyWatchHistory();
  const continueWatching = useContinueWatching(enabled, 24);
  const { user } = useUser();
  const { scope } = useRecommendationFolderScope(user?.id ?? "guest");

  return useMemo(() => {
    const tmdbSeeds: TMDBRecommendationSeed[] = [];
    const seedWeights = new Map<string, number>();
    const typeCounts = new Map<"movie" | "tv", number>();
    const genreCounts = new Map<string, number>();

    const processItem = (
      item: { tmdbId?: string; type: "movie" | "tv"; genre?: string[] },
      weight = 1,
      decay = 1
    ) => {
      if (!item.tmdbId) return;
      const finalWeight = weight * decay;

      const key = `${item.type}:${item.tmdbId}`;
      seedWeights.set(key, (seedWeights.get(key) ?? 0) + finalWeight);

      const seedExists = tmdbSeeds.some((s) => s.tmdbId === item.tmdbId && s.type === item.type);
      if (!seedExists) {
        tmdbSeeds.push({
          tmdbId: item.tmdbId,
          type: item.type,
          genres: item.genre
        });
      }

      typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + finalWeight);
      if (item.genre) {
        for (const g of item.genre) {
          genreCounts.set(g, (genreCounts.get(g) ?? 0) + finalWeight);
        }
      }
    };

    const hasFolderScope = scope.folders.length > 0;
    const selectedFolders = new Set(scope.folders);
    const scopedWatchlist = watchlist?.filter((item) => {
      if (!hasFolderScope) return true;
      const folder = item.watchlistFolder?.trim();
      return scope.mode === "include"
        ? !!folder && selectedFolders.has(folder)
        : !folder || !selectedFolders.has(folder);
    });

    if (!hasFolderScope && continueWatching) {
      continueWatching.forEach((item, index) => {
        processItem(item, 1, Math.max(0.5, 1 - index * 0.05));
      });
    }

    if (scopedWatchlist) {
      scopedWatchlist.forEach((item, index) => {
        processItem(item, 7, Math.max(0.3, 1 - index * 0.02));
      });
    }

    if (!hasFolderScope && watchHistory) {
      watchHistory.forEach((item, index) => {
        processItem(item, 1, Math.max(0.1, 1 - index * 0.01));
      });
    }

    tmdbSeeds.sort((a, b) => {
      const wa = seedWeights.get(`${a.type}:${a.tmdbId}`) ?? 0;
      const wb = seedWeights.get(`${b.type}:${b.tmdbId}`) ?? 0;
      return wb - wa;
    });

    const preferredType =
      Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "movie";

    const genres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre);

    return {
      tmdbSeeds,
      preferredType,
      genres
    };
  }, [watchlist, watchHistory, continueWatching, scope]);
}

const REC_CACHE_KEY = "fishy_recs_cache_v2";
const REC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REC_DISPLAY_HISTORY_KEY = "fishy_recs_display_history_v1";
const MAX_DISPLAY_HISTORY_ENTRIES = 80;
const MAX_RECOMMENDATION_SEEDS = 10;

interface RecCacheEntry {
  timestamp: number;
  cards: ContentCard[];
}

interface RecCache {
  [seedKey: string]: RecCacheEntry;
}

function loadRecCache(): RecCache {
  try {
    const raw = localStorage.getItem(REC_CACHE_KEY);
    if (raw) {
      const cache = JSON.parse(raw) as RecCache;
      const oldestAllowed = Date.now() - REC_CACHE_TTL_MS;
      for (const [key, entry] of Object.entries(cache)) {
        if (!entry || !Array.isArray(entry.cards) || entry.timestamp < oldestAllowed)
          delete cache[key];
      }
      return cache;
    }
  } catch {}
  return {};
}

function saveRecCache(cache: RecCache) {
  try {
    const keys = Object.keys(cache).sort((a, b) => cache[b]!.timestamp - cache[a]!.timestamp);
    if (keys.length > 80) {
      const toDelete = keys.slice(80);
      for (const k of toDelete) {
        delete cache[k];
      }
    }
    localStorage.setItem(REC_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

type RecDisplayHistory = Record<string, Record<string, number>>;

function loadRecDisplayHistory(): RecDisplayHistory {
  try {
    const raw = localStorage.getItem(REC_DISPLAY_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RecDisplayHistory;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRecDisplayHistory(history: RecDisplayHistory) {
  try {
    const entries = Object.entries(history);
    if (entries.length > MAX_DISPLAY_HISTORY_ENTRIES) {
      for (const [key] of entries.slice(0, entries.length - MAX_DISPLAY_HISTORY_ENTRIES)) {
        delete history[key];
      }
    }
    localStorage.setItem(REC_DISPLAY_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function chooseRecommendations(
  cards: ContentCard[],
  limit: number,
  refreshSeed: number,
  historyKey: string
) {
  const shuffled = shuffleWithSeed(cards, refreshSeed);
  const history = loadRecDisplayHistory();
  const previousStreaks = history[historyKey] ?? {};
  const isBlocked = (card: ContentCard) =>
    (previousStreaks[`${card.type}:${card.tmdbId}`] ?? 0) >= 2;

  const preferred = shuffled.filter((card) => !isBlocked(card));
  const selected = [...preferred.slice(0, limit)];
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((card) => `${card.type}:${card.tmdbId}`));
    selected.push(
      ...shuffled
        .filter((card) => !selectedIds.has(`${card.type}:${card.tmdbId}`))
        .slice(0, limit - selected.length)
    );
  }

  const nextStreaks: Record<string, number> = {};
  for (const card of selected) {
    const key = `${card.type}:${card.tmdbId}`;
    nextStreaks[key] = (previousStreaks[key] ?? 0) + 1;
  }
  history[historyKey] = nextStreaks;
  saveRecDisplayHistory(history);

  return selected;
}

export function useRecommendations(
  limit = 12,
  typeFilter: "all" | TMDBMediaType = "all",
  refreshSeed = 0,
  enabled = true,
  seed?: {
    tmdbSeeds?: TMDBRecommendationSeed[];
    preferredType: TMDBMediaType;
    genres: string[];
  }
) {
  const personalizedSeed = usePersonalizedRecommendationSeed(enabled);
  const activeSeed = seed !== undefined ? seed : personalizedSeed;
  const [recommendations, setRecommendations] = useState<ContentCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const seedSignature = activeSeed?.tmdbSeeds
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
    const apiKey = getApiKey();
    const excludedIds = new Set(activeSeed?.tmdbSeeds?.map((s) => `${s.type}:${s.tmdbId}`));

    const allSeeds =
      activeSeed?.tmdbSeeds?.filter((s) => typeFilter === "all" || s.type === typeFilter) ?? [];

    const shuffledSeeds = shuffleWithSeed(allSeeds, refreshSeed);
    const seedItemsToFetch = shuffledSeeds.slice(0, MAX_RECOMMENDATION_SEEDS);

    const collect = (responses: Array<{ data: TMDBBrowseListResponse; type?: TMDBMediaType }>) =>
      collectTmdbCards(responses, { excludedIds, typeFilter }).map(tmdbCardToContentCard);

    async function load() {
      setIsLoading(true);
      try {
        const cache = loadRecCache();
        const now = Date.now();
        const cachedCards: ContentCard[] = [];
        const missingSeeds: TMDBRecommendationSeed[] = [];

        for (const s of allSeeds) {
          const key = `${s.type}:${s.tmdbId}`;
          const entry = cache[key];
          if (entry) {
            cachedCards.push(...entry.cards);
          } else {
            if (seedItemsToFetch.some((f) => f.tmdbId === s.tmdbId && f.type === s.type)) {
              missingSeeds.push(s);
            }
          }
        }

        let newCards: ContentCard[] = [];

        if (missingSeeds.length > 0) {
          const recResponses = await Promise.all(
            missingSeeds.flatMap((s) => [
              fetchTmdbListOrEmpty(
                `/${s.type}/${s.tmdbId}/recommendations`,
                apiKey,
                controller.signal,
                { page: 1 }
              ).then((data) => ({ data, type: s.type })),
              fetchTmdbListOrEmpty(`/${s.type}/${s.tmdbId}/similar`, apiKey, controller.signal, {
                page: 1
              }).then((data) => ({ data, type: s.type }))
            ])
          );

          for (let i = 0; i < missingSeeds.length; i++) {
            const s = missingSeeds[i]!;
            const seedResponses = [recResponses[i * 2]!, recResponses[i * 2 + 1]!];
            const cardsForSeed = collect(seedResponses);
            cache[`${s.type}:${s.tmdbId}`] = { timestamp: now, cards: cardsForSeed };
            newCards.push(...cardsForSeed);
          }

          saveRecCache(cache);
        }

        const allCards = [...cachedCards, ...newCards];

        if (!controller.signal.aborted) {
          const deduped = Array.from(
            new Map(allCards.map((c) => [`${c.type}:${c.tmdbId}`, c])).values()
          );
          const historyKey = `${typeFilter}:${seedSignature ?? "default"}`;
          setRecommendations(chooseRecommendations(deduped, limit, refreshSeed, historyKey));
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
    activeSeed?.preferredType,
    seedSignature,
    activeSeed?.genres?.join("|")
  ]);

  return { recommendations, isLoading };
}

export function useContentDetail(
  tmdbId: string | undefined,
  type: TMDBMediaType | undefined,
  enabled = true,
  includeImdb = true
) {
  const [detail, setDetail] = useState<TMDBFullDetail | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setDetail(undefined);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    setDetail(undefined);
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await fetchTmdbFullDetail(tmdbId, type, getApiKey(), controller.signal);
        if (!result) {
          if (!cancelRef.current) setDetail(null);
          return;
        }

        const imdbId = result.imdbId;
        const imdbDetail =
          includeImdb && imdbId
            ? await fetchImdbFullDetail(imdbId, type, imdbRequest, controller.signal)
            : null;

        if (!cancelRef.current) {
          setDetail({
            ...result,
            imdbId: imdbDetail?.imdbId ?? result.imdbId,
            rating: imdbDetail?.rating ?? result.rating,
            voteAverage: imdbDetail?.voteAverage ?? result.voteAverage
          });
        }
      } catch {
        if (!cancelRef.current) setDetail(null);
      } finally {
        if (!cancelRef.current) setIsLoading(false);
      }
    })();

    return () => {
      controller.abort();
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled, includeImdb]);

  return { detail, isLoading };
}

export function useSeasonEpisodes(
  tmdbId: string | undefined,
  seasonNumber: number,
  enabled = true,
  imdbId?: string
) {
  const [season, setSeason] = useState<
    | {
        overview?: string;
        episodes: Array<{
          episodeNumber: number;
          name: string;
          overview?: string;
          stillUrl?: string;
          runtime?: number;
          voteAverage: number;
        }>;
      }
    | null
    | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef(false);
  const imdbRatingsRef = useRef(new Map<number, number>());

  useEffect(() => {
    if (!enabled || !tmdbId) {
      setSeason(undefined);
      return;
    }
    cancelRef.current = false;
    imdbRatingsRef.current.clear();
    setIsLoading(true);
    setSeason(undefined);
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await fetchTmdbSeasonEpisodes(
          tmdbId,
          seasonNumber,
          getApiKey(),
          controller.signal
        );
        const episodes = (result?.episodes ?? []).map((episode) => ({
          ...episode,
          voteAverage: imdbRatingsRef.current.get(episode.episodeNumber) ?? 0
        }));
        if (!cancelRef.current && result) setSeason({ ...result, episodes });
      } catch {
        if (!cancelRef.current) setSeason(null);
      } finally {
        if (!cancelRef.current) setIsLoading(false);
      }
    })();

    return () => {
      controller.abort();
      cancelRef.current = true;
    };
  }, [tmdbId, seasonNumber, enabled]);

  useEffect(() => {
    if (!enabled || !tmdbId || !imdbId) return;

    let cancelled = false;
    const controller = new AbortController();

    void fetchImdbSeasonEpisodes(imdbId, seasonNumber, imdbRequest, controller.signal)
      .then((imdbSeason) => {
        if (cancelled || controller.signal.aborted) return;

        const ratings = new Map(
          (imdbSeason?.episodes ?? []).map((episode) => [
            episode.episodeNumber,
            episode.voteAverage
          ])
        );
        imdbRatingsRef.current = ratings;
        setSeason((current) =>
          current
            ? {
                ...current,
                episodes: current.episodes.map((episode) => ({
                  ...episode,
                  voteAverage: ratings.get(episode.episodeNumber) ?? 0
                }))
              }
            : current
        );
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) imdbRatingsRef.current.clear();
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tmdbId, seasonNumber, enabled, imdbId]);

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
    if (!enabled || !tmdbId || seasonCount < 1) {
      setSeasons([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);

    void Promise.all(
      Array.from({ length: seasonCount }, (_, index) => index + 1).map(async (seasonNumber) => {
        const season = imdbId
          ? await fetchImdbSeasonEpisodes(imdbId, seasonNumber, imdbRequest, controller.signal)
          : null;
        return {
          seasonNumber,
          episodes: (season?.episodes ?? []).map(({ episodeNumber, name, voteAverage }) => ({
            episodeNumber,
            name,
            voteAverage
          }))
        };
      })
    )
      .then((results) => {
        if (!cancelled && !controller.signal.aborted) setSeasons(results);
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) setSeasons([]);
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, seasonCount, tmdbId, imdbId]);

  return { seasons, isLoading };
}
