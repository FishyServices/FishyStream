import { useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useWatchProgressContext } from "./useWatchProgress";
import {
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
    [user?.id]
  );

  return useMemo(() => serverData?.map(fromWatchHistoryItemWire), [serverData]);
}

export function useContinueWatching(): WatchHistoryItemMeta[] | undefined {
  const { user } = useUser();
  const serverData = useOneShotConvexQuery<WatchHistoryItemWire[]>(
    !!user,
    (convex) => convex.query(api.watchHistory.listContinueWatching, { clerkUserId: user!.id }),
    [user?.id]
  );
  const localProgress = useWatchProgressContext();

  return useMemo(() => {
    if (serverData === undefined) return undefined;

    const result = serverData.map(fromWatchHistoryItemWire);
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
