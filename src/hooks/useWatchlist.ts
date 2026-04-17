import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";

export function useSyncUser() {
  return useMutation(api.users.syncCurrentUser);
}

export function useMyWatchlist(): Doc<"content">[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchlist.getMyWatchlist, user ? { clerkUserId: user.id } : "skip");
}

export function useIsInWatchlist(contentId: Id<"content"> | undefined): boolean | undefined {
  const { user } = useUser();
  return useQuery(
    api.watchlist.isInWatchlist,
    user && contentId ? { clerkUserId: user.id, contentId } : "skip"
  );
}

export function useAddToWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlist.add);

  return (contentId: Id<"content">) => {
    if (!user) throw new Error("Not signed in");
    return mutation({ clerkUserId: user.id, contentId });
  };
}

export function useRemoveFromWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlist.remove);

  return (contentId: Id<"content">) => {
    if (!user) throw new Error("Not signed in");
    return mutation({ clerkUserId: user.id, contentId });
  };
}
