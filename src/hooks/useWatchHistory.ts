import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useCallback } from "react";

export interface WatchHistoryItem extends Doc<"content"> {
  progress: number;
  completed: boolean;
  watchedAt: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export function useMyWatchHistory(): WatchHistoryItem[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchHistory.getMyWatchHistory, user ? { clerkUserId: user.id } : "skip");
}

export function useContinueWatching():
  | Array<
      Doc<"content"> & {
        progress: number;
        completed: boolean;
        watchedAt: number;
        positionSeconds?: number;
        durationSeconds?: number;
        seasonNumber?: number;
        episodeNumber?: number;
      }
    >
  | undefined {
  const { user } = useUser();
  return useQuery(api.watchHistory.getContinueWatching, user ? { clerkUserId: user.id } : "skip");
}

export function useRemoveFromHistory() {
  const { user } = useUser();
  const mutation = useMutation(api.watchHistory.removeFromHistory);

  return useCallback(
    (contentId: Id<"content">) => {
      if (!user) throw new Error("Not signed in");
      return mutation({ clerkUserId: user.id, contentId });
    },
    [user, mutation]
  );
}
