import { useMutation, usePaginatedQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useWatchProgressContext } from "./useWatchProgress";
import { type ContentId, type WatchHistoryItemMeta } from "@content/contentMetadata";
import { useOneShotConvexQuery } from "@/shared/useOneShotConvexQuery";
import { removeWatchProgressEntry } from "@/shared/storage/localStorageStore";

const WATCH_HISTORY_PAGE_SIZE = 20;

export function useMyWatchHistoryPagination(search = "") {
  const { user } = useUser();
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [cachedHistory, setCachedHistory] = useState<WatchHistoryItemMeta[]>([]);
  const cachedUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  const {
    results: history,
    status,
    loadMore
  } = usePaginatedQuery(
    api.domains.history.watchHistory.listWatchHistoryPage,
    user
      ? {
          clerkUserId: user.id,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {})
        }
      : "skip",
    { initialNumItems: WATCH_HISTORY_PAGE_SIZE }
  );

  useEffect(() => {
    if (!user) {
      cachedUserId.current = undefined;
      setCachedHistory((current) => (current.length ? [] : current));
      return;
    }

    if (cachedUserId.current !== user.id) {
      cachedUserId.current = user.id;
      setCachedHistory(history);
      return;
    }

    setCachedHistory((current) => {
      const merged = new Map<string, WatchHistoryItemMeta>(
        history.map((item): [string, WatchHistoryItemMeta] => [item._id, item])
      );
      for (const item of current) {
        if (!merged.has(item._id)) merged.set(item._id, item);
      }
      const next = [...merged.values()];
      return next.length === current.length && next.every((item, index) => item === current[index])
        ? current
        : next;
    });
  }, [history, user]);

  return {
    history: user
      ? [...new Map([...history, ...cachedHistory].map((item) => [item._id, item])).values()]
      : history,
    isLoading: status === "LoadingFirstPage",
    isLoadingMore: status === "LoadingMore",
    canLoadMore: status === "CanLoadMore",
    loadMore: () => loadMore(WATCH_HISTORY_PAGE_SIZE)
  };
}

export function useMyWatchHistory(): WatchHistoryItemMeta[] | undefined {
  const { user } = useUser();
  const serverData = useOneShotConvexQuery<WatchHistoryItemMeta[]>(
    !!user,
    (convex) =>
      convex.query(api.domains.history.watchHistory.listWatchHistory, { clerkUserId: user!.id }),
    [user?.id],
    undefined,
    user ? `watch_history_${user.id}` : undefined
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
      return mutation({ clerkUserId: user.id, contentId });
    },
    [user, mutation]
  );
}
