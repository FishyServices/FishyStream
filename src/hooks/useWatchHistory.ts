import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";

export interface WatchHistoryItem extends Doc<"content"> {
  progress: number;
  completed: boolean;
  watchedAt: number;
  positionSeconds?: number;
  durationSeconds?: number;
}

export interface WatchProgressState {
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}

export function useMyWatchHistory(): WatchHistoryItem[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchHistory.getMyWatchHistory, user ? { clerkUserId: user.id } : "skip");
}

export function useContinueWatching(): Array<Doc<"content"> & { progress: number }> | undefined {
  const { user } = useUser();
  return useQuery(api.watchHistory.getContinueWatching, user ? { clerkUserId: user.id } : "skip");
}

export function useWatchProgress(
  contentId: Id<"content"> | undefined
): WatchProgressState | undefined {
  const { user } = useUser();
  return useQuery(
    api.watchHistory.getWatchProgress,
    user && contentId ? { clerkUserId: user.id, contentId } : "skip"
  );
}

export function useUpdateProgress() {
  const { user } = useUser();
  const mutation = useMutation(api.watchHistory.updateProgress);

  return (
    contentId: Id<"content">,
    progress: number,
    completed?: boolean,
    positionSeconds?: number,
    durationSeconds?: number
  ) => {
    if (!user) throw new Error("Not signed in");
    return mutation({
      clerkUserId: user.id,
      contentId,
      progress,
      completed,
      positionSeconds,
      durationSeconds
    });
  };
}

export function useMarkAsCompleted() {
  const { user } = useUser();
  const mutation = useMutation(api.watchHistory.markAsCompleted);

  return (contentId: Id<"content">) => {
    if (!user) throw new Error("Not signed in");
    return mutation({ clerkUserId: user.id, contentId });
  };
}

export function useRemoveFromHistory() {
  const { user } = useUser();
  const mutation = useMutation(api.watchHistory.removeFromHistory);

  return (contentId: Id<"content">) => {
    if (!user) throw new Error("Not signed in");
    return mutation({ clerkUserId: user.id, contentId });
  };
}
