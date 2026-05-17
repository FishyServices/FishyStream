import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useWatchProgressContext } from "./useWatchProgress";
import type { WatchHistoryItemMeta } from "../../shared/contentMetadata";

export function useMyWatchHistory(): WatchHistoryItemMeta[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchHistory.listWatchHistory, user ? { clerkUserId: user.id } : "skip");
}

export function useContinueWatching(): WatchHistoryItemMeta[] | undefined {
  const { user } = useUser();
  const serverData = useQuery(
    api.watchHistory.listContinueWatching,
    user ? { clerkUserId: user.id } : "skip"
  );
  const localProgress = useWatchProgressContext();

  return useMemo(() => {
    if (serverData === undefined) return undefined;

    const result = [...serverData];
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
            positionSeconds: progress.positionSeconds,
            durationSeconds: progress.durationSeconds,
            seasonNumber: progress.seasonNumber,
            episodeNumber: progress.episodeNumber,
            source: progress.source,
            dub: progress.dub,
            watchedAt: Date.now()
          };
        }
      }
    }

    return result;
  }, [serverData, localProgress]);
}

export function useRemoveFromHistory() {
  const { user } = useUser();
  const mutation = useMutation(api.watchHistory.removeWatchHistoryEntry);

  return useCallback(
    (contentId: Id<"content">) => {
      if (!user) throw new Error("Not signed in");
      return mutation({ clerkUserId: user.id, contentId });
    },
    [user, mutation]
  );
}
