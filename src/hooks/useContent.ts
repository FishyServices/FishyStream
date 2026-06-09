import { useAction } from "convex/react";
import { useEffect, useState, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type {
  ContentCard,
  ContentId,
  ContentFeatured,
  ContentPlaybackWire
} from "../../shared/contentMetadata";
import { fromContentPlaybackWire } from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";
import {
  TMDB_DISCOVER_GENRES,
  TMDB_API_KEY,
  shuffleWithSeed,
  fetchTmdbListOrEmpty,
  fetchTmdbCredits,
  fetchTmdbVideos,
  fetchTmdbRelated,
  fetchTmdbDetails,
  fetchTmdbSearch,
  fetchTmdbDiscover,
  collectTmdbCards,
  toTMDBContentCard,
  type TMDBItem,
  type TMDBMediaType,
  type TMDBContentCard,
  type TMDBCreditResult,
  type TMDBVideoResult,
  type TMDBRelatedItem,
  type TMDBBrowseListResponse
} from "@fishy/providers/tmdb";

export type { TMDBItem };

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
  return `tmdb:${type}:${tmdbId}` as ContentId;
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

// ─── Homepage ─────────────────────────────────────────────────────────────────

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

// ─── New releases ─────────────────────────────────────────────────────────────

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

// ─── Playback ─────────────────────────────────────────────────────────────────

export function useContentPlaybackByTmdbId(tmdbId: string | undefined, typeHint?: TMDBMediaType) {
  const syncSingleContent = useAction(api.tmdb.syncSingleContent);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [isSyncingMissing, setIsSyncingMissing] = useState(false);
  const data = useOneShotConvexQuery<ContentPlaybackWire | null>(
    !!tmdbId,
    (convex) =>
      convex.query(api.content.getContentPlaybackByTmdbId, { tmdbId: tmdbId!, type: typeHint }),
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

    void syncSingleContent({ tmdbId: parsedTmdbId, type: typeHint })
      .then(() => {
        if (!cancelled) setSyncAttempt((v) => v + 1);
      })
      .finally(() => {
        if (!cancelled) setIsSyncingMissing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data, isSyncingMissing, syncAttempt, syncSingleContent, tmdbId, typeHint]);

  if (data === null && isSyncingMissing) return undefined;
  return data ? fromContentPlaybackWire(data) : data;
}

// ─── Related / Credits / Videos ──────────────────────────────────────────────

export function useRelatedContent(
  tmdbId: number | undefined,
  type: TMDBMediaType | undefined,
  limit = 10,
  enabled = true
) {
  const [related, setRelated] = useState<TMDBRelatedItem[]>([]);
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

// ─── Search ───────────────────────────────────────────────────────────────────

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

// ─── Browse ───────────────────────────────────────────────────────────────────

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

// ─── Recommendations ──────────────────────────────────────────────────────────

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
    const apiKey = getApiKey();
    const excludedIds = new Set(seed?.tmdbSeeds?.map((s) => `${s.type}:${s.tmdbId}`));
    const genreIds = Array.from(
      new Set(
        (seed?.genres ?? [])
          .map((g) => TMDB_DISCOVER_GENRES[g.trim().toLowerCase()])
          .filter((id): id is number => typeof id === "number")
      )
    ).slice(0, 3);
    const seedItems = shuffleWithSeed(seed?.tmdbSeeds ?? [], refreshSeed)
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .slice(0, 5);

    const collect = (responses: Array<{ data: TMDBBrowseListResponse; type?: TMDBMediaType }>) =>
      collectTmdbCards(responses, { excludedIds, typeFilter }).map(tmdbCardToContentCard);

    const fallbackTypes: TMDBMediaType[] =
      typeFilter === "all" ? [seed?.preferredType ?? "movie", "tv", "movie"] : [typeFilter];

    async function load() {
      setIsLoading(true);
      try {
        const recResponses = seedItems.length
          ? await Promise.all(
              seedItems.flatMap((s) => [
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
            )
          : [];

        let cards = collect(recResponses);

        if (cards.length < limit && genreIds.length) {
          const genreResponses = await Promise.all(
            fallbackTypes.map((t) =>
              fetchTmdbListOrEmpty(`/discover/${t}`, apiKey, controller.signal, {
                page: (refreshSeed % 5) + 1,
                sort_by: "popularity.desc",
                with_genres: genreIds.join("|")
              }).then((data) => ({ data, type: t }))
            )
          );
          cards = [...cards, ...collect(genreResponses)];
        }

        if (cards.length < limit) {
          const trendingResponses = await Promise.all(
            (typeFilter === "all" ? ([undefined] as const) : ([typeFilter] as const)).map((t) =>
              fetchTmdbListOrEmpty(
                t ? `/trending/${t}/week` : "/trending/all/week",
                apiKey,
                controller.signal,
                { page: (refreshSeed % 5) + 1 }
              ).then((data) => ({ data, type: t }))
            )
          );
          cards = [...cards, ...collect(trendingResponses)];
        }

        if (!controller.signal.aborted) {
          const deduped = Array.from(
            new Map(cards.map((c) => [`${c.type}:${c.tmdbId}`, c])).values()
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

  return { recommendations, isLoading };
}
