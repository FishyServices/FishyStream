import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode
} from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  fromWatchlistGridWire,
  type ContentType,
  type WatchlistGridItem,
  type WatchlistGridWire
} from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";

const LS_KEY = "watchlist_ids";
const MY_LIST_LIMIT = 500;
const WATCHLIST_GRID_CACHE_TTL_MS = 30_000;

function watchlistGridCacheKey(userId: string) {
  return `watchlist_grid_v2_${userId}`;
}

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

function readWatchlistGridCache(userId: string | undefined): WatchlistGridWire[] | undefined {
  if (!userId) return undefined;
  try {
    const raw = sessionStorage.getItem(watchlistGridCacheKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: WatchlistGridWire[] };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > WATCHLIST_GRID_CACHE_TTL_MS) {
      sessionStorage.removeItem(watchlistGridCacheKey(userId));
      return undefined;
    }
    return Array.isArray(parsed.data) ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeWatchlistGridCache(userId: string | undefined, data: WatchlistGridWire[]) {
  if (!userId) return;
  try {
    sessionStorage.setItem(
      watchlistGridCacheKey(userId),
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {}
}

type WatchlistCtx = {
  set: Set<string>;
  tmdbSet: Set<string>;
  toggle: (id: Id<"content">, snapshot?: WatchlistSnapshot) => Promise<void>;
  hydrateFromServerIds: (ids: Array<{ id: string; tmdbId?: string }>) => void;
  hydrated: boolean;
};

export type WatchlistSnapshot = {
  title: string;
  type: ContentType;
  posterUrl: string;
  tmdbId?: string;
};

const Ctx = createContext<WatchlistCtx | undefined>(undefined);

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const location = useLocation();
  const { isLoading: isConvexAuthLoading } = useConvexAuth();
  const isMyListRoute = location.pathname === "/my-list";

  const [ids, setIds] = useState<Set<string>>(() => new Set(lsGet()));
  const [tmdbIds, setTmdbIds] = useState<Set<string>>(() => new Set());
  const [idToTmdbMap, setIdToTmdbMap] = useState<Map<string, string>>(() => new Map());
  const [hydrated, setHydrated] = useState(() => !user);
  const hasLocalIds = ids.size > 0;

  const addMutation = useMutation(api.watchlist.addWatchlistEntry);
  const removeMutation = useMutation(api.watchlist.removeWatchlistEntry);
  const serverIds = useOneShotConvexQuery<Array<{ id: string; tmdbId?: string }>>(
    !!user && !isConvexAuthLoading && !isMyListRoute && !hasLocalIds,
    (client) => client.query(api.watchlist.listWatchlistContentIds, { clerkUserId: user!.id }),
    [user?.id, isConvexAuthLoading, isMyListRoute, hasLocalIds]
  );

  const hydrateFromServerIds = useCallback((serverIds: Array<{ id: string; tmdbId?: string }>) => {
    setHydrated(true);
    const newIds = serverIds.map((x) => x.id);
    const newTmdbIds = serverIds.map((x) => x.tmdbId).filter((x): x is string => !!x);

    setIds((prev) => {
      const merged = new Set([...prev, ...newIds]);
      lsSet([...merged]);
      return merged;
    });
    setTmdbIds((prev) => {
      return new Set([...prev, ...newTmdbIds]);
    });
    setIdToTmdbMap((prev) => {
      const next = new Map(prev);
      for (const item of serverIds) {
        if (item.tmdbId) {
          next.set(item.id, item.tmdbId);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setHydrated(true);
      return;
    }
    if (isConvexAuthLoading) return;
    if (hasLocalIds) {
      setHydrated(true);
      return;
    }
    if (serverIds === undefined) return;
    setHydrated(true);
  }, [hasLocalIds, user, serverIds, isConvexAuthLoading]);

  useEffect(() => {
    if (!serverIds) return;
    hydrateFromServerIds(serverIds);
  }, [hydrateFromServerIds, serverIds]);

  const toggle = useCallback(
    async (id: Id<"content">, snapshot?: WatchlistSnapshot) => {
      const adding = !ids.has(id);
      const tmdbId = snapshot?.tmdbId || idToTmdbMap.get(id);

      setIds((prev) => {
        const next = new Set(prev);
        adding ? next.add(id) : next.delete(id);
        lsSet([...next]);
        return next;
      });

      if (tmdbId) {
        setTmdbIds((prev) => {
          const next = new Set(prev);
          adding ? next.add(tmdbId) : next.delete(tmdbId);
          return next;
        });
        if (adding) {
          setIdToTmdbMap((prev) => {
            const next = new Map(prev);
            next.set(id, tmdbId);
            return next;
          });
        } else {
          setIdToTmdbMap((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }
      }

      if (!user) return;

      try {
        if (adding) {
          await addMutation({ clerkUserId: user.id, contentId: id, snapshot });
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
        if (tmdbId) {
          setTmdbIds((prev) => {
            const next = new Set(prev);
            adding ? next.delete(tmdbId) : next.add(tmdbId);
            return next;
          });
        }
      }
    },
    [ids, idToTmdbMap, user, addMutation, removeMutation]
  );

  return (
    <Ctx.Provider value={{ set: ids, tmdbSet: tmdbIds, toggle, hydrateFromServerIds, hydrated }}>
      {children}
    </Ctx.Provider>
  );
}

function useWatchlistCtx(): WatchlistCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("GlobalWatchlistProvider not found");
  return ctx;
}

export function useIsInWatchlist(id: string | undefined): boolean {
  const { set, tmdbSet } = useWatchlistCtx();
  if (!id) return false;
  if (set.has(id)) return true;
  if (id.startsWith("tmdb:")) {
    const parts = id.split(":");
    const extractedTmdbId = parts[parts.length - 1];
    if (extractedTmdbId && tmdbSet.has(extractedTmdbId)) return true;
  }
  return false;
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
  const { hydrateFromServerIds } = useWatchlistCtx();
  const [cachedServerData, setCachedServerData] = useState<WatchlistGridWire[] | undefined>(() =>
    readWatchlistGridCache(user?.id)
  );

  useEffect(() => {
    setCachedServerData(readWatchlistGridCache(user?.id));
  }, [user?.id]);

  const serverData = useOneShotConvexQuery<WatchlistGridWire[]>(
    !!user && cachedServerData === undefined,
    (client) =>
      client.query(api.watchlist.listWatchlist, {
        clerkUserId: user!.id,
        limit: MY_LIST_LIMIT
      }),
    [user?.id, cachedServerData === undefined]
  );

  useEffect(() => {
    if (!serverData) return;
    writeWatchlistGridCache(user?.id, serverData);
    setCachedServerData(serverData);
  }, [serverData, user?.id]);

  const effectiveData = serverData ?? cachedServerData;

  useEffect(() => {
    if (!effectiveData) return;
    hydrateFromServerIds(effectiveData.map((item) => ({ id: item[0], tmdbId: item[4] ?? undefined })));
  }, [effectiveData, hydrateFromServerIds]);

  return useMemo(() => effectiveData?.map(fromWatchlistGridWire), [effectiveData]);
}

export function useUpdateWatchlistFolder() {
  return useMutation(api.watchlist.setWatchlistFolder);
}
