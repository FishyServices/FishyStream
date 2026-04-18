import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser } from "@clerk/react";
import { useMemo, createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Id } from "../../convex/_generated/dataModel";

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

const GlobalWatchlistContext = createContext<Set<string> | undefined>(undefined);

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [localSet, setLocalSet] = useState<Set<string>>(() => new Set(getLocalWatchlist()));

  const serverResult = useQuery(
    api.watchlist.getAllWatchlistContentIds,
    user ? { clerkUserId: user.id } : "skip"
  );

  useEffect(() => {
    if (serverResult) {
      const newSet = new Set(serverResult);
      setLocalSet(newSet);
      setLocalWatchlist(serverResult);
    }
  }, [serverResult]);

  return (
    <GlobalWatchlistContext.Provider value={localSet}>{children}</GlobalWatchlistContext.Provider>
  );
}

export function useGlobalWatchlist(): Set<string> {
  const context = useContext(GlobalWatchlistContext);
  if (context === undefined) {
    return new Set(getLocalWatchlist());
  }
  return context;
}

export function useIsInWatchlistGlobal(contentId: Id<"content"> | undefined): boolean {
  const watchlist = useGlobalWatchlist();
  if (!contentId) return false;
  return watchlist.has(contentId);
}
