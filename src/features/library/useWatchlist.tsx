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

type WatchlistContextValue = {
  ids: Set<string>;
  toggle: (contentId: ContentId, snapshot: WatchlistSnapshot) => Promise<void>;
  removeMany: (contentIds: readonly ContentId[]) => Promise<void>;
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
  const removeWatchlistMutation = useMutation(
    api.domains.watchlist.watchlist.removeWatchlistEntries
  );
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

  const removeMany = useCallback(
    async (contentIds: readonly ContentId[]) => {
      const removed = new Set(contentIds);
      const beforeIds = new Set(ids);
      const beforeSnapshots = getWatchlistSnapshots();
      const beforeTmdb = getWatchlistTmdbMap();
      const nextIds = new Set([...ids].filter((id) => !removed.has(id as ContentId)));
      setIds(nextIds);
      setWatchlistIds([...nextIds]);
      const nextSnapshots = { ...beforeSnapshots };
      for (const contentId of removed) delete nextSnapshots[contentId];
      setWatchlistSnapshots(nextSnapshots);
      const nextTmdb = { ...beforeTmdb };
      for (const contentId of removed) delete nextTmdb[contentId];
      setWatchlistTmdbMap(nextTmdb);

      if (!user) return;
      try {
        await removeWatchlistMutation({ clerkUserId: user.id, contentIds: [...contentIds] });
      } catch (error) {
        setIds(beforeIds);
        setWatchlistIds([...beforeIds]);
        setWatchlistSnapshots(beforeSnapshots);
        setWatchlistTmdbMap(beforeTmdb);
        throw error;
      }
    },
    [ids, removeWatchlistMutation, user]
  );

  return (
    <WatchlistContext.Provider
      value={{ ids, toggle, removeMany, hydrated: !user || serverIds !== undefined }}
    >
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

export function useMyWatchlistPagination(folder?: string | null, search = "") {
  const { user } = useUser();
  const { ids } = useWatchlistContext();
  const { results, status, loadMore } = usePaginatedQuery(
    api.domains.watchlist.watchlist.listWatchlist,
    user
      ? {
          clerkUserId: user.id,
          ...(folder !== undefined ? { folder } : {}),
          ...(search.trim() ? { search: search.trim() } : {})
        }
      : "skip",
    { initialNumItems: PAGE_SIZE }
  );
  const guestItems = useMemo(() => listGuestWatchlist(), [ids]);
  const serverItems = results as WatchlistGridItem[];
  const items = user ? (status === "LoadingFirstPage" ? undefined : serverItems) : guestItems;
  const requestLoadMore = useCallback(() => loadMore(PAGE_SIZE), [loadMore]);
  return {
    items,
    allItems: items ?? [],
    isLoading: status === "LoadingFirstPage" && !!user,
    isLoadingMore: status === "LoadingMore",
    canLoadMore: status === "CanLoadMore",
    loadMore: requestLoadMore
  };
}

export function useWatchlistSummary() {
  const { user } = useUser();
  return useQuery(
    api.domains.watchlist.watchlist.listWatchlistSummary,
    user ? { clerkUserId: user.id } : "skip"
  );
}

export function useRemoveWatchlistEntries() {
  const { user } = useUser();
  const { removeMany } = useWatchlistContext();
  const mutation = useMutation(api.domains.watchlist.watchlist.removeWatchlistEntries);
  return useCallback(
    async (contentIds: readonly ContentId[]) => {
      if (!user) {
        await removeMany(contentIds);
        return;
      }
      await mutation({ clerkUserId: user.id, contentIds: [...contentIds] });
    },
    [mutation, removeMany, user]
  );
}

export function useSetWatchlistFolderForEntries() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.watchlist.watchlist.setWatchlistFolderForEntries);
  return useCallback(
    async (contentIds: readonly ContentId[], folder?: string) => {
      if (!user) {
        guestWatchlistPersistence.setFolderMany(contentIds, folder);
        return;
      }
      await mutation({ clerkUserId: user.id, contentIds: [...contentIds], folder });
    },
    [mutation, user]
  );
}

export function useRenameWatchlistFolder() {
  const { user } = useUser();
  const mutation = useMutation(api.domains.watchlist.watchlist.renameFolder);
  return useCallback(
    async (from: string, to: string) => {
      if (!user) return;
      await mutation({ clerkUserId: user.id, from, to });
    },
    [mutation, user]
  );
}

export function useMyWatchlist() {
  return useMyWatchlistPagination().items;
}

export function useAllMyWatchlist() {
  return useAllMyWatchlistState().items;
}

export function useAllMyWatchlistState() {
  const pagination = useMyWatchlistPagination();

  useEffect(() => {
    if (!pagination.canLoadMore || pagination.isLoadingMore) return;
    pagination.loadMore();
  }, [pagination.canLoadMore, pagination.isLoadingMore, pagination.loadMore]);

  return {
    items: pagination.allItems,
    isLoading: pagination.isLoading || pagination.isLoadingMore || pagination.canLoadMore
  };
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
      if (!user) return Promise.resolve();
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
      if (!user) return guestWatchlistPersistence.setFolder(contentId, folder);
      return mutation({ clerkUserId: user.id, contentId, folder });
    },
    [mutation, user]
  );
}
