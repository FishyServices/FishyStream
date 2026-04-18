import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useMemo, useCallback, useState } from "react";

const optimisticAdded = new Set<string>();
const optimisticRemoved = new Set<string>();
const optimisticCallbacks = new Set<() => void>();

function notifyOptimisticUpdate() {
  optimisticCallbacks.forEach((cb) => cb());
}

export function useSyncUser() {
  return useMutation(api.users.syncCurrentUser);
}

export function useMyWatchlist(): Doc<"content">[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchlist.getMyWatchlist, user ? { clerkUserId: user.id } : "skip");
}

export function useWatchlistStatus(contentIds: Id<"content">[]) {
  const { user } = useUser();
  const data = useQuery(
    api.watchlist.areInWatchlist,
    user && contentIds.length > 0 ? { clerkUserId: user.id, contentIds } : "skip"
  );

  const inWatchlistSet = useMemo(() => {
    return new Set(data ?? []);
  }, [data]);

  const isInWatchlist = useMemo(() => {
    return (contentId: Id<"content">) => inWatchlistSet.has(contentId);
  }, [inWatchlistSet]);

  return { isInWatchlist, isLoading: data === undefined, inWatchlistSet };
}

export function useIsInWatchlist(contentId: Id<"content"> | undefined): boolean | undefined {
  const myWatchlist = useMyWatchlist();
  const [, forceUpdate] = useState({});

  useMemo(() => {
    const cb = () => forceUpdate({});
    optimisticCallbacks.add(cb);
    return () => {
      optimisticCallbacks.delete(cb);
    };
  }, []);

  return useMemo(() => {
    if (!contentId || !myWatchlist) return undefined;
    if (optimisticAdded.has(contentId)) return true;
    if (optimisticRemoved.has(contentId)) return false;
    return myWatchlist.some((item) => item._id === contentId);
  }, [contentId, myWatchlist]);
}

export function useAddToWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlist.add);

  return useCallback(
    (contentId: Id<"content">) => {
      if (!user) throw new Error("Not signed in");
      optimisticAdded.add(contentId);
      optimisticRemoved.delete(contentId);
      notifyOptimisticUpdate();
      return mutation({ clerkUserId: user.id, contentId }).finally(() => {
        optimisticAdded.delete(contentId);
        notifyOptimisticUpdate();
      });
    },
    [user, mutation]
  );
}

export function useRemoveFromWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlist.remove);

  return useCallback(
    (contentId: Id<"content">) => {
      if (!user) throw new Error("Not signed in");
      optimisticRemoved.add(contentId);
      optimisticAdded.delete(contentId);
      notifyOptimisticUpdate();
      return mutation({ clerkUserId: user.id, contentId }).finally(() => {
        optimisticRemoved.delete(contentId);
        notifyOptimisticUpdate();
      });
    },
    [user, mutation]
  );
}
