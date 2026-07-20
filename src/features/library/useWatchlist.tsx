import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode
} from "react";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { useLocation } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { type ContentId, type ContentType, type WatchlistGridItem } from "@content/contentMetadata";
import { useOneShotConvexQuery } from "@/shared/useOneShotConvexQuery";
import { guestWatchlistPersistence, listGuestWatchlist } from "./persistence";

import {
  getWatchlistIds,
  setWatchlistIds,
  getWatchlistTmdbMap,
  setWatchlistTmdbMap,
  getWatchlistSnapshots,
  setWatchlistSnapshots,
  type LocalContentSnapshot as WatchlistSnapshot
} from "@/shared/storage/localStorageStore";

const MY_LIST_PAGE_SIZE = 20;
const WATCHLIST_GRID_CACHE_TTL_MS = 30_000;

function watchlistGridCacheKey(userId: string) {
  return `watchlist_grid_v2_${userId}`;
}

function readWatchlistGridCache(userId: string | undefined): WatchlistGridItem[] | undefined {
  if (!userId) return undefined;
  try {
    const raw = sessionStorage.getItem(watchlistGridCacheKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: WatchlistGridItem[] };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > WATCHLIST_GRID_CACHE_TTL_MS) {
      sessionStorage.removeItem(watchlistGridCacheKey(userId));
      return undefined;
    }
    return Array.isArray(parsed.data) ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeWatchlistGridCache(userId: string | undefined, data: WatchlistGridItem[]) {
  if (!userId) return;
  try {
    sessionStorage.setItem(
      watchlistGridCacheKey(userId),
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {}
}

function matchesWatchlistFolder(item: WatchlistGridItem, folder?: string | null) {
  if (folder === undefined) return true;
  const itemFolder = item.watchlistFolder?.trim();
  return folder === null ? !itemFolder : itemFolder === folder;
}

function mergeWatchlistItems(...lists: WatchlistGridItem[][]) {
  const merged = new Map<string, WatchlistGridItem>();
  for (const list of lists) {
    for (const item of list) {
      if (!merged.has(item._id)) merged.set(item._id, item);
    }
  }
  return Array.from(merged.values());
}

type WatchlistCtx = {
  set: Set<string>;
  tmdbSet: Set<string>;
  toggle: (id: ContentId, snapshot: WatchlistSnapshot) => Promise<void>;
  hydrateFromServerIds: (ids: Array<{ id: string; tmdbId?: string }>) => void;
  hydrated: boolean;
};

export type { WatchlistSnapshot };

const Ctx = createContext<WatchlistCtx | undefined>(undefined);

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const location = useLocation();
  const { isLoading: isConvexAuthLoading } = useConvexAuth();
  const isMyListRoute = location.pathname === "/my-list";

  const [ids, setIds] = useState<Set<string>>(() => new Set(getWatchlistIds()));
  const [idToTmdbMap, setIdToTmdbMap] = useState<Map<string, string>>(() => {
    const stored = getWatchlistTmdbMap();
    return new Map(Object.entries(stored));
  });
  const [tmdbIds, setTmdbIds] = useState<Set<string>>(() => {
    const stored = getWatchlistTmdbMap();
    return new Set(Object.values(stored));
  });
  const [hydrated, setHydrated] = useState(() => !user);
  const hasLocalIds = ids.size > 0;

  const toggleMutation = useMutation(api.domains.watchlist.watchlist.toggleWatchlistEntry);
  const serverIds = useOneShotConvexQuery<Array<{ id: string; tmdbId?: string }>>(
    !!user && !isConvexAuthLoading && !isMyListRoute,
    (client) =>
      client.query(api.domains.watchlist.watchlist.listWatchlistContentIds, {
        clerkUserId: user!.id
      }),
    [user?.id, isConvexAuthLoading, isMyListRoute]
  );

  const hydrateFromServerIds = useCallback(
    (serverEntries: Array<{ id: string; tmdbId?: string }>) => {
      setHydrated(true);
      const newIds = serverEntries.map((x) => x.id);

      setIds((prev) => {
        let hasNew = false;
        for (const id of newIds) {
          if (!prev.has(id)) {
            hasNew = true;
            break;
          }
        }
        if (!hasNew && prev.size === newIds.length) return prev;

        const merged = new Set([...prev, ...newIds]);
        setWatchlistIds([...merged]);
        return merged;
      });
      setIdToTmdbMap((prev) => {
        const next = new Map(prev);
        for (const item of serverEntries) {
          if (item.tmdbId) {
            next.set(item.id, item.tmdbId);
          }
        }
        setWatchlistTmdbMap(next);
        return next;
      });
      setTmdbIds(() => {
        const freshMap = getWatchlistTmdbMap();
        return new Set(Object.values(freshMap));
      });
    },
    []
  );

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
    async (id: ContentId, snapshot: WatchlistSnapshot) => {
      const adding = !ids.has(id);
      const tmdbId = snapshot?.tmdbId || idToTmdbMap.get(id);

      setIds((prev) => {
        const next = new Set(prev);
        adding ? next.add(id) : next.delete(id);
        setWatchlistIds([...next]);
        return next;
      });

      const currentSnapshots = getWatchlistSnapshots();
      if (adding && snapshot) {
        currentSnapshots[id] = snapshot;
        setWatchlistSnapshots(currentSnapshots);
      } else if (!adding) {
        delete currentSnapshots[id];
        setWatchlistSnapshots(currentSnapshots);
      }

      if (tmdbId) {
        setTmdbIds((prev) => {
          const next = new Set(prev);
          adding ? next.add(tmdbId) : next.delete(tmdbId);
          return next;
        });
        setIdToTmdbMap((prev) => {
          const next = new Map(prev);
          if (adding) {
            next.set(id, tmdbId);
          } else {
            next.delete(id);
          }
          setWatchlistTmdbMap(next);
          return next;
        });
      }

      if (!user) return;

      try {
        await toggleMutation({
          clerkUserId: user.id,
          contentId: id,
          tmdbId: tmdbId || "",
          contentType: snapshot?.type || "movie",
          title: snapshot?.title || "Unknown",
          posterUrl: snapshot?.posterUrl || "",
          inWatchlist: adding
        });
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          adding ? next.delete(id) : next.add(id);
          setWatchlistIds([...next]);
          return next;
        });
        if (tmdbId) {
          setTmdbIds((prev) => {
            const next = new Set(prev);
            adding ? next.delete(tmdbId) : next.add(tmdbId);
            return next;
          });
          setIdToTmdbMap((prev) => {
            const next = new Map(prev);
            if (adding) {
              next.delete(id);
            } else {
              next.set(id, tmdbId);
            }
            setWatchlistTmdbMap(next);
            return next;
          });
        }
      }
    },
    [ids, idToTmdbMap, user, toggleMutation]
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

export function useWatchlistContentIds(): ContentId[] {
  const { set } = useWatchlistCtx();
  return useMemo(() => Array.from(set) as ContentId[], [set]);
}

export function useWatchlistHydrated(): boolean {
  return useWatchlistCtx().hydrated;
}

function useMyWatchlistData(folder?: string | null) {
  const { user } = useUser();
  const { hydrateFromServerIds } = useWatchlistCtx();
  const [cachedServerData, setCachedServerData] = useState<WatchlistGridItem[] | undefined>(() =>
    readWatchlistGridCache(user?.id)?.filter((item) => matchesWatchlistFolder(item, folder))
  );

  useEffect(() => {
    setCachedServerData(
      readWatchlistGridCache(user?.id)?.filter((item) => matchesWatchlistFolder(item, folder))
    );
  }, [folder, user?.id]);

  const {
    results: serverResults,
    status: serverStatus,
    loadMore: loadMoreServerData
  } = usePaginatedQuery(
    api.domains.watchlist.watchlist.listWatchlist,
    user ? { clerkUserId: user.id, ...(folder !== undefined ? { folder } : {}) } : "skip",
    { initialNumItems: MY_LIST_PAGE_SIZE }
  );

  useEffect(() => {
    if (serverStatus === "LoadingFirstPage" || !user) return;
    const merged = mergeWatchlistItems(serverResults, readWatchlistGridCache(user.id) ?? []);
    writeWatchlistGridCache(user.id, merged);
    setCachedServerData(merged.filter((item) => matchesWatchlistFolder(item, folder)));
  }, [folder, serverResults, serverStatus, user]);

  const { set } = useWatchlistCtx();
  const offlineData = useMemo(() => {
    if (user || serverStatus !== "LoadingFirstPage") return undefined;

    return listGuestWatchlist()
      .filter((item) => {
        if (folder === undefined) return true;
        return folder === null
          ? !item.watchlistFolder?.trim()
          : item.watchlistFolder?.trim() === folder;
      })
      .map((item) => ({ ...item, savedAt: Date.now() }));
  }, [folder, serverStatus, set, user]);

  const effectiveData =
    serverStatus === "LoadingFirstPage"
      ? (cachedServerData ?? offlineData)
      : user
        ? mergeWatchlistItems(serverResults, cachedServerData ?? [])
        : offlineData;
  const allItems = user
    ? mergeWatchlistItems(readWatchlistGridCache(user.id) ?? [], serverResults)
    : listGuestWatchlist().map((item) => ({ ...item, savedAt: Date.now() }));

  useEffect(() => {
    const hydratedItems = mergeWatchlistItems(serverResults, cachedServerData ?? []);
    if (hydratedItems.length > 0) {
      hydrateFromServerIds(hydratedItems.map((item) => ({ id: item._id, tmdbId: item.tmdbId })));
    }
  }, [cachedServerData, hydrateFromServerIds, serverResults]);

  return {
    items: effectiveData,
    allItems,
    isLoading: effectiveData === undefined,
    isLoadingMore: serverStatus === "LoadingMore",
    canLoadMore: serverStatus === "CanLoadMore",
    loadMore: () => loadMoreServerData(MY_LIST_PAGE_SIZE)
  };
}

export function useMyWatchlist(): WatchlistGridItem[] | undefined {
  return useMyWatchlistData().items;
}

export function useMyWatchlistPagination(folder?: string | null) {
  return useMyWatchlistData(folder);
}

export function useUpdateWatchlistFolder() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.watchlist.watchlist.setWatchlistFolder);

  return useCallback(
    (args: { clerkUserId?: string; contentId: ContentId; folder?: string }) => {
      if (!user) return guestWatchlistPersistence.setFolder("guest", args.contentId, args.folder);
      return mutation({
        clerkUserId: user.id,
        contentId: args.contentId,
        folder: args.folder
      });
    },
    [mutation, user]
  );
}
