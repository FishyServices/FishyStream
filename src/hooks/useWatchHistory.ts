import { useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { useWatchProgressContext } from "./useWatchProgress";
import { type ContentId, type WatchHistoryItemMeta } from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";
import { removeWatchProgressEntry } from "../lib/localStorageStore";

export function useMyWatchHistory(): WatchHistoryItemMeta[] | undefined {
  const { user } = useUser();
  const serverData = useOneShotConvexQuery<WatchHistoryItemMeta[]>(
    !!user,
    (convex) => convex.query(api.watchHistory.listWatchHistory, { clerkUserId: user!.id }),
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

    const result = history.filter((item) => !item.completed).slice(0, limit);
    for (const [contentId, progress] of localProgress?.entries() ?? []) {
      if (progress.completed || progress.progress < 5) continue;

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
  const mutation = useMutation(api.watchHistory.removeWatchHistoryEntry);

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
