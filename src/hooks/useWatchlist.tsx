import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useConvex, useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  WatchlistItemMeta as SharedWatchlistItemMeta,
  WatchlistUpdateMeta as SharedWatchlistUpdateMeta
} from "../../shared/contentMetadata";

export type WatchlistItem = SharedWatchlistItemMeta;
export type WatchlistUpdate = SharedWatchlistUpdateMeta;

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
};

const Ctx = createContext<WatchlistCtx | undefined>(undefined);

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();

  const [ids, setIds] = useState<Set<string>>(() => new Set(lsGet()));

  const addMutation = useMutation(api.watchlist.add);
  const removeMutation = useMutation(api.watchlist.remove);

  const serverIds = useQuery(
    api.watchlist.getAllWatchlistContentIds,
    user ? { clerkUserId: user.id } : "skip"
  );

  useEffect(() => {
    if (!serverIds) return;
    setIds((prev) => {
      const merged = new Set([...prev, ...serverIds]);
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

  return <Ctx.Provider value={{ set: ids, toggle }}>{children}</Ctx.Provider>;
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

export function useMyWatchlist(): SharedWatchlistItemMeta[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchlist.getMyWatchlist, user ? { clerkUserId: user.id } : "skip");
}

export function useWatchlistUpdates(): SharedWatchlistUpdateMeta[] | undefined {
  const { user } = useUser();
  return useQuery(api.watchlist.getUpdates, user ? { clerkUserId: user.id } : "skip");
}

export function useWatchlistUpdateCount(): number | undefined {
  const { user } = useUser();
  return useQuery(api.watchlist.getUpdateCount, user ? { clerkUserId: user.id } : "skip");
}

export function useWatchlistUpdatesOnDemand() {
  const { user } = useUser();
  const convex = useConvex();

  return useCallback(async () => {
    if (!user) return [];
    return convex.query(api.watchlist.getUpdates, { clerkUserId: user.id });
  }, [convex, user]);
}

export function useUpdateWatchlistFolder() {
  return useMutation(api.watchlist.updateFolder);
}

export function useAcknowledgeWatchlistUpdates() {
  return useMutation(api.watchlist.acknowledgeUpdates);
}
