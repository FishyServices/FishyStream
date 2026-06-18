import { useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { useWatchProgressContext } from "./useWatchProgress";
import {
  type ContentId,
  fromWatchHistoryItemWire,
  type WatchHistoryItemMeta,
  type WatchHistoryItemWire
} from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";

export function useMyWatchHistory(): WatchHistoryItemMeta[] | undefined {
  const { user } = useUser();
  const serverData = useOneShotConvexQuery<WatchHistoryItemWire[]>(
    !!user,
    (convex) => convex.query(api.watchHistory.listWatchHistory, { clerkUserId: user!.id }),
    [user?.id],
    undefined,
    user ? `watch_history_${user.id}` : undefined
  );

  return useMemo(() => serverData?.map(fromWatchHistoryItemWire), [serverData]);
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
      if (!user) throw new Error("Not signed in");
      return mutation({ clerkUserId: user.id, contentId });
    },
    [user, mutation]
  );
}
