import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode
} from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { WatchlistGridItem, WatchlistUpdateMeta } from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";

const LS_KEY = "watchlist_ids";

function lsGet(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function lsSet(ids: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {}
}

type WatchlistCtx = {
  set: Set<string>;
  toggle: (id: Id<"content">) => Promise<void>;
  hydrated: boolean;
};

const Ctx = createContext<WatchlistCtx | undefined>(undefined);

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { isLoading: isConvexAuthLoading } = useConvexAuth();

  const [ids, setIds] = useState<Set<string>>(() => new Set(lsGet()));
  const [hydrated, setHydrated] = useState(() => !user);

  const addMutation = useMutation(api.watchlist.addWatchlistEntry);
  const removeMutation = useMutation(api.watchlist.removeWatchlistEntry);
  const serverIds = useOneShotConvexQuery<string[]>(
    !!user && !isConvexAuthLoading,
    (client) => client.query(api.watchlist.listWatchlistContentIds, { clerkUserId: user!.id }),
    [user?.id, isConvexAuthLoading]
  );

  useEffect(() => {
    if (!user) {
      setHydrated(true);
      return;
    }
    if (isConvexAuthLoading) return;
    if (serverIds === undefined) return;
    setHydrated(true);
  }, [user, serverIds, isConvexAuthLoading]);

  useEffect(() => {
    if (!serverIds) return;
    setIds((prev) => {
      const merged = new Set([...prev, ...serverIds]);
      if (merged.size === prev.size && Array.from(merged).every((id) => prev.has(id))) {
        return prev;
      }
      lsSet([...merged]);
      return merged;
    });
  }, [serverIds]);

  const toggle = useCallback(
    async (id: Id<"content">) => {
      const adding = !ids.has(id);

      setIds((prev) => {
        const next = new Set(prev);
        adding ? next.add(id) : next.delete(id);
        lsSet([...next]);
        return next;
      });

      if (!user) return;

      try {
        if (adding) {
          await addMutation({ clerkUserId: user.id, contentId: id });
        } else {
          await removeMutation({ clerkUserId: user.id, contentId: id });
        }
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          adding ? next.delete(id) : next.add(id);
          lsSet([...next]);
          return next;
        });
      }
    },
    [ids, user, addMutation, removeMutation]
  );

  return <Ctx.Provider value={{ set: ids, toggle, hydrated }}>{children}</Ctx.Provider>;
}

function useWatchlistCtx(): WatchlistCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("GlobalWatchlistProvider not found");
  return ctx;
}

export function useIsInWatchlist(id: Id<"content"> | undefined): boolean {
  const { set } = useWatchlistCtx();
  return id ? set.has(id) : false;
}

export function useToggleWatchlist() {
  return useWatchlistCtx().toggle;
}

export function useWatchlistContentIds(): Id<"content">[] {
  const { set } = useWatchlistCtx();
  return useMemo(() => Array.from(set) as Id<"content">[], [set]);
}

export function useWatchlistHydrated(): boolean {
  return useWatchlistCtx().hydrated;
}

export function useMyWatchlist(): WatchlistGridItem[] | undefined {
  const { user } = useUser();
  return useOneShotConvexQuery<WatchlistGridItem[]>(
    !!user,
    (client) => client.query(api.watchlist.listWatchlist, { clerkUserId: user!.id }),
    [user?.id]
  );
}

export function useWatchlistUpdates(): WatchlistUpdateMeta[] | undefined {
  const { user } = useUser();
  return useOneShotConvexQuery<WatchlistUpdateMeta[]>(
    !!user,
    (client) => client.query(api.watchlist.listWatchlistUpdates, { clerkUserId: user!.id }),
    [user?.id]
  );
}

export function useWatchlistUpdatesOnDemand() {
  const { user } = useUser();
  const convex = useConvex();

  return useCallback(async (): Promise<WatchlistUpdateMeta[]> => {
    if (!user) return [];
    return convex.query(api.watchlist.listWatchlistUpdates, { clerkUserId: user.id });
  }, [convex, user]);
}

export function useUpdateWatchlistFolder() {
  return useMutation(api.watchlist.setWatchlistFolder);
}

export function useAcknowledgeWatchlistUpdates() {
  return useMutation(api.watchlist.acknowledgeWatchlistUpdates);
}
