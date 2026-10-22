import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useWatchProgressContext } from "./useWatchProgress";
import {
  fromImageWire,
  type ContentId,
  type WatchHistoryItemMeta,
  type WatchHistoryPageItem
} from "@content/contentMetadata";
import { useOneShotConvexQuery } from "@/shared/useOneShotConvexQuery";
import { removeWatchProgressEntry } from "@/shared/storage/viewerStateStorage";

const WATCH_HISTORY_PAGE_SIZE = 20;

export function useMyWatchHistoryPagination(search = "") {
  const { user } = useUser();
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const settledHistory = useRef<{ userId?: string; items: WatchHistoryPageItem[] }>({
    userId: user?.id,
    items: []
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const {
    results: paginatedHistory,
    status,
    loadMore
  } = usePaginatedQuery(
    api.domains.history.watchHistory.listWatchHistoryPage,
    user
      ? {
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {})
        }
      : "skip",
    { initialNumItems: WATCH_HISTORY_PAGE_SIZE }
  );
  const history = useMemo(
    () =>
      paginatedHistory.map((item) => ({
        ...item,
        posterUrl: fromImageWire(item.posterUrl),
        tmdbId: item._id.slice(item._id.lastIndexOf(":") + 1)
      })),
    [paginatedHistory]
  );

  if (settledHistory.current.userId !== user?.id) {
    settledHistory.current = { userId: user?.id, items: [] };
  }

  const queryPending = search.trim() !== debouncedSearch.trim() || status === "LoadingFirstPage";
  const displayedHistory = queryPending ? settledHistory.current.items : history;

  useEffect(() => {
    if (!queryPending) settledHistory.current = { userId: user?.id, items: history };
  }, [history, queryPending, user?.id]);

  return {
    history: displayedHistory,
    isLoading: status === "LoadingFirstPage",
    isQueryPending: queryPending,
    isLoadingMore: status === "LoadingMore",
    canLoadMore: status === "CanLoadMore",
    loadMore: () => loadMore(WATCH_HISTORY_PAGE_SIZE)
  };
}

export function useMyWatchHistory(limit = 20): WatchHistoryItemMeta[] | undefined {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const enabled = !!isLoaded && !!isSignedIn && !!user && isAuthenticated && !isAuthLoading;
  const serverData = useOneShotConvexQuery<WatchHistoryItemMeta[]>(
    enabled,
    (convex) =>
      convex.query(api.domains.history.watchHistory.listWatchHistory, {
        limit
      }),
    [user?.id, limit, enabled],
    undefined,
    user && enabled ? `watch_history_${user.id}_${limit}` : undefined
  );

  const localProgress = useWatchProgressContext();

  const offlineData = useMemo(() => {
    if (user || serverData !== undefined) return undefined;
    if (!localProgress) return undefined;

    const items: (WatchHistoryItemMeta & { clientUpdatedAt: number })[] = [];
    for (const [contentId, state] of localProgress.entries()) {
      if (!state.snapshot) continue;
      items.push({
        _id: contentId as ContentId,
        title: state.snapshot.title,
        type: state.snapshot.type,
        posterUrl: state.snapshot.posterUrl,
        tmdbId: state.snapshot.tmdbId,
        genre: state.snapshot.genre,
        year: state.snapshot.year,
        voteAverage: state.snapshot.voteAverage,
        new: false,
        progress: state.progress,
        completed: state.completed,
        seasonNumber: state.seasonNumber,
        episodeNumber: state.episodeNumber,
        source: state.source,
        dub: state.dub,
        clientUpdatedAt: state.clientUpdatedAt
      });
    }

    return items.sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt);
  }, [user, serverData, localProgress]);

  return serverData ?? offlineData;
}

export function useContinueWatching(enabled = true, limit = 6): WatchHistoryItemMeta[] | undefined {
  const history = useMyWatchHistory();
  const localProgress = useWatchProgressContext();

  return useMemo(() => {
    if (!enabled) return [];
    if (history === undefined) return undefined;

    const result = history.slice(0, limit);
    for (const [contentId, progress] of localProgress?.entries() ?? []) {
      if (progress.progress < 5) continue;

      const existingIndex = result.findIndex((item) => item._id === contentId);
      if (existingIndex >= 0) {
        const existing = result[existingIndex]!;
        if (progress.progress > existing.progress) {
          result[existingIndex] = {
            ...existing,
            progress: progress.progress,
            completed: progress.completed,
            seasonNumber: progress.seasonNumber,
            episodeNumber: progress.episodeNumber,
            source: progress.source,
            dub: progress.dub
          };
        }
      }
    }

    return result;
  }, [history, localProgress, enabled, limit]);
}

export function useRemoveFromHistory() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.history.watchHistory.removeWatchHistoryEntry);

  return useCallback(
    (contentId: ContentId) => {
      if (!user) {
        removeWatchProgressEntry(contentId);
        return Promise.resolve();
      }
      return mutation({ contentId });
    },
    [user, mutation]
  );
}

export function useClearWatchHistory() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.history.watchHistory.clearWatchHistory);

  return useCallback(() => {
    if (!user) return Promise.resolve(0);
    return mutation({});
  }, [mutation, user]);
}
