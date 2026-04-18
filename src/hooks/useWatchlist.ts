import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";

const WATCHLIST_STORAGE_KEY = "watchlist_local";

function getLocalWatchlist(): string[] {
  try {
    const data = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setLocalWatchlist(contentIds: string[]) {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(contentIds));
  } catch {}
}

function addToLocalWatchlist(contentId: string) {
  const existing = getLocalWatchlist();
  if (!existing.includes(contentId)) {
    setLocalWatchlist([...existing, contentId]);
  }
}

function removeFromLocalWatchlist(contentId: string) {
  const existing = getLocalWatchlist();
  setLocalWatchlist(existing.filter((id) => id !== contentId));
}

export function useMyWatchlist(): Doc<"content">[] | undefined {
  const { user } = useUser();
  const serverWatchlist = useQuery(
    api.watchlist.getMyWatchlist,
    user ? { clerkUserId: user.id } : "skip"
  );
  const [localState, setLocalState] = useState<Doc<"content">[] | undefined>();

  useEffect(() => {
    if (serverWatchlist) {
      setLocalState(serverWatchlist);
      setLocalWatchlist(serverWatchlist.map((item) => item._id));
    }
  }, [serverWatchlist]);

  return localState ?? serverWatchlist;
}

export function useIsInWatchlist(contentId: Id<"content"> | undefined): boolean | undefined {
  const { user } = useUser();
  const [localResult, setLocalResult] = useState<boolean | undefined>();

  useEffect(() => {
    if (!contentId) {
      setLocalResult(undefined);
      return;
    }
    const localWatchlist = getLocalWatchlist();
    setLocalResult(localWatchlist.includes(contentId));
  }, [contentId]);

  const serverResult = useQuery(
    api.watchlist.isInWatchlist,
    user && contentId ? { clerkUserId: user.id, contentId } : "skip"
  );

  if (!contentId || !user) return undefined;
  return serverResult ?? localResult;
}

export function useAddToWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlist.add);

  return useCallback(
    async (contentId: Id<"content">) => {
      if (!user) throw new Error("Not signed in");
      addToLocalWatchlist(contentId);
      return mutation({ clerkUserId: user.id, contentId });
    },
    [user, mutation]
  );
}

export function useRemoveFromWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlist.remove);

  return useCallback(
    async (contentId: Id<"content">) => {
      if (!user) throw new Error("Not signed in");
      removeFromLocalWatchlist(contentId);
      return mutation({ clerkUserId: user.id, contentId });
    },
    [user, mutation]
  );
}
