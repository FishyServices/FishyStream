import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../../convex/_generated/api";
import { type ContentId, type WatchlistGridItem } from "@content/contentMetadata";
import { guestWatchlistPersistence, listGuestWatchlist } from "./persistence";
import {
  getWatchlistIds,
  getWatchlistSnapshots,
  getWatchlistTmdbMap,
  setWatchlistIds,
  setWatchlistSnapshots,
  setWatchlistTmdbMap,
  type LocalContentSnapshot as WatchlistSnapshot
} from "@/shared/storage/localStorageStore";

const PAGE_SIZE = 20;

function folderCacheKey(folder: string | null | undefined) {
  return folder === undefined ? "all" : folder === null ? "unsorted" : `folder:${folder}`;
}

function mergePages(latest: WatchlistGridItem[], cached: WatchlistGridItem[] | undefined) {
  if (!cached?.length) return latest;
  const seen = new Set(latest.map((item) => item._id));
  return [...latest, ...cached.filter((item) => !seen.has(item._id))];
}

type WatchlistContextValue = {
  ids: Set<string>;
  toggle: (contentId: ContentId, snapshot: WatchlistSnapshot) => Promise<void>;
  hydrated: boolean;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export type { WatchlistSnapshot };

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const serverIds = useQuery(
    api.domains.watchlist.watchlist.listWatchlistContentIds,
    user ? { clerkUserId: user.id } : "skip"
  );
  const toggleEntry = useMutation(api.domains.watchlist.watchlist.toggleWatchlistEntry);
  const [ids, setIds] = useState<Set<string>>(() => new Set(getWatchlistIds()));

  useEffect(() => {
    if (!user || serverIds === undefined) return;
    const next = new Set(serverIds.map((entry) => entry.id));
    setIds(next);
    setWatchlistIds([...next]);
    setWatchlistTmdbMap(
      Object.fromEntries(serverIds.map((entry) => [entry.id, entry.tmdbId ?? ""]))
    );
  }, [serverIds, user]);

  const toggle = useCallback(
    async (contentId: ContentId, snapshot: WatchlistSnapshot) => {
      const adding = !ids.has(contentId);
      const beforeIds = new Set(ids);
      const beforeSnapshots = getWatchlistSnapshots();
      const beforeTmdb = getWatchlistTmdbMap();
      const nextIds = new Set(ids);
      if (adding) nextIds.add(contentId);
      else nextIds.delete(contentId);
      setIds(nextIds);
      setWatchlistIds([...nextIds]);

      const nextSnapshots = { ...beforeSnapshots };
      if (adding) nextSnapshots[contentId] = snapshot;
      else delete nextSnapshots[contentId];
      setWatchlistSnapshots(nextSnapshots);

      const nextTmdb = { ...beforeTmdb };
      if (adding) nextTmdb[contentId] = snapshot.tmdbId;
      else delete nextTmdb[contentId];
      setWatchlistTmdbMap(nextTmdb);

      if (!user) return;
      try {
        await toggleEntry({
          clerkUserId: user.id,
          contentId,
          tmdbId: snapshot.tmdbId,
          contentType: snapshot.type,
          title: snapshot.title,
          posterUrl: snapshot.posterUrl,
          inWatchlist: adding
        });
      } catch (error) {
        setIds(beforeIds);
        setWatchlistIds([...beforeIds]);
        setWatchlistSnapshots(beforeSnapshots);
        setWatchlistTmdbMap(beforeTmdb);
        throw error;
      }
    },
    [ids, toggleEntry, user]
  );

  return (
    <WatchlistContext.Provider value={{ ids, toggle, hydrated: !user || serverIds !== undefined }}>
      {children}
    </WatchlistContext.Provider>
  );
}

function useWatchlistContext() {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error("GlobalWatchlistProvider not found");
  return context;
}

export function useIsInWatchlist(contentId: string | undefined) {
  const { ids } = useWatchlistContext();
  return !!contentId && ids.has(contentId);
}

export function useToggleWatchlist() {
  return useWatchlistContext().toggle;
}

export function useWatchlistContentIds(): ContentId[] {
  const { ids } = useWatchlistContext();
  return useMemo(() => [...ids] as ContentId[], [ids]);
}

export function useWatchlistHydrated() {
  return useWatchlistContext().hydrated;
}

export function useMyWatchlistPagination(folder?: string | null) {
  const { user } = useUser();
  const cacheKey = folderCacheKey(folder);
  const [pagesByFolder, setPagesByFolder] = useState<Map<string, WatchlistGridItem[]>>(
    () => new Map()
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.domains.watchlist.watchlist.listWatchlist,
    user ? { clerkUserId: user.id, ...(folder !== undefined ? { folder } : {}) } : "skip",
    { initialNumItems: PAGE_SIZE }
  );
  const serverItems = results as WatchlistGridItem[];
  const cachedItems = pagesByFolder.get(cacheKey);
  const cachedFolderItems = useMemo(() => {
    const unique = new Map<string, WatchlistGridItem>();
    for (const page of pagesByFolder.values()) {
      for (const item of page) unique.set(item._id, item);
    }
    return [...unique.values()].filter((item) => {
      const itemFolder = item.watchlistFolder?.trim();
      return folder === undefined ? true : folder === null ? !itemFolder : itemFolder === folder;
    });
  }, [folder, pagesByFolder]);
  const immediateItems = cachedItems ?? cachedFolderItems;

  useEffect(() => {
    if (!user || status === "LoadingFirstPage") return;
    setPagesByFolder((current) => {
      const merged = mergePages(serverItems, current.get(cacheKey));
      const existing = current.get(cacheKey);
      if (existing === merged) return current;
      const next = new Map(current);
      next.set(cacheKey, merged);
      return next;
    });
  }, [cacheKey, serverItems, status, user]);

  const guestItems = useMemo(() => listGuestWatchlist(), []);
  const items = user
    ? status === "LoadingFirstPage"
      ? immediateItems
      : mergePages(serverItems, immediateItems)
    : guestItems;
  const visibleItems =
    user && status === "LoadingFirstPage" && !immediateItems.length ? undefined : items;
  const allItems = useMemo(() => {
    if (!user) return guestItems;
    const unique = new Map<string, WatchlistGridItem>();
    for (const page of pagesByFolder.values()) {
      for (const item of page) unique.set(item._id, item);
    }
    for (const item of visibleItems ?? []) unique.set(item._id, item);
    return [...unique.values()];
  }, [guestItems, pagesByFolder, user, visibleItems]);
  return {
    items: visibleItems,
    allItems,
    isLoading: status === "LoadingFirstPage" && !!user && !immediateItems.length,
    isLoadingMore: status === "LoadingMore",
    canLoadMore: status === "CanLoadMore",
    loadMore: () => loadMore(PAGE_SIZE)
  };
}

export function useMyWatchlist() {
  return useMyWatchlistPagination().items;
}

export function useWatchlistFolders() {
  const { user } = useUser();
  return useQuery(
    api.domains.watchlist.watchlist.listFolders,
    user ? { clerkUserId: user.id } : "skip"
  );
}

export function useDeleteWatchlistFolder() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.watchlist.watchlist.deleteFolder);
  return useCallback(
    (name: string) => {
      if (!user) throw new Error("Sign in to delete folders");
      return mutation({ clerkUserId: user.id, name });
    },
    [mutation, user]
  );
}

export function useUpdateWatchlistFolder() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.watchlist.watchlist.setWatchlistFolder);
  return useCallback(
    (
      input: ContentId | { clerkUserId?: string; contentId: ContentId; folder?: string },
      requestedFolder?: string
    ) => {
      const contentId = typeof input === "string" ? input : input.contentId;
      const folder = typeof input === "string" ? requestedFolder : input.folder;
      if (!user) return guestWatchlistPersistence.setFolder("guest", contentId, folder);
      return mutation({ clerkUserId: user.id, contentId, folder });
    },
    [mutation, user]
  );
}
