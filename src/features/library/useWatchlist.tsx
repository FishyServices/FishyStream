import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../../convex/_generated/api";
import { parseContentId, type ContentId, type WatchlistGridItem } from "@content/contentMetadata";
import { guestWatchlistPersistence, listGuestWatchlist } from "./persistence";
import {
  getWatchlistIds,
  getWatchlistCache,
  getWatchlistSnapshots,
  getWatchlistTmdbMap,
  setWatchlistIds,
  setWatchlistCache,
  setWatchlistSnapshots,
  setWatchlistTmdbMap,
  type LocalContentSnapshot as WatchlistSnapshot
} from "@/shared/storage/localStorageStore";

const PAGE_SIZE = 20;

export type { WatchlistSnapshot };

type SavedState = {
  ids: Set<string>;
  ready: boolean;
};

type WatchlistApi = {
  state: SavedState;
  save: (contentId: ContentId, snapshot: WatchlistSnapshot) => Promise<void>;
  drop: (contentIds: readonly ContentId[]) => Promise<void>;
};

const WatchlistContext = createContext<WatchlistApi | null>(null);

function eraseFromGuestStore(ids: Iterable<string>) {
  const snapshots = { ...getWatchlistSnapshots() };
  const tmdbMap = { ...getWatchlistTmdbMap() };
  for (const id of ids) {
    delete snapshots[id];
    delete tmdbMap[id];
  }
  setWatchlistSnapshots(snapshots);
  setWatchlistTmdbMap(tmdbMap);
}

function writeToGuestStore(contentId: string, snapshot: WatchlistSnapshot) {
  setWatchlistSnapshots({ ...getWatchlistSnapshots(), [contentId]: snapshot });
  setWatchlistTmdbMap({ ...getWatchlistTmdbMap(), [contentId]: snapshot.tmdbId });
}

function clearGuestStore() {
  setWatchlistIds([]);
  setWatchlistSnapshots({});
  setWatchlistTmdbMap({});
}

function updateUserCache(
  userId: string,
  ids: Iterable<string>,
  snapshots: Record<string, WatchlistSnapshot>
) {
  setWatchlistCache(userId, {
    ids: [...new Set(ids)].filter((id): id is ContentId => parseContentId(id) !== null),
    snapshots
  });
}

export function GlobalWatchlistProvider({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  const remoteIds = useQuery(
    api.domains.watchlist.watchlist.listWatchlistContentIds,
    user ? { clerkUserId: user.id } : "skip"
  );
  const toggleEntry = useMutation(api.domains.watchlist.watchlist.toggleWatchlistEntry);
  const dropEntries = useMutation(api.domains.watchlist.watchlist.removeWatchlistEntries);
  const ensureFolderCounts = useMutation(api.domains.watchlist.watchlist.ensureFolderCounts);

  const [ids, setIds] = useState<Set<string>>(() => new Set(getWatchlistIds()));
  const idsSnapshotRef = useRef(ids);
  const pendingOpRef = useRef(0);
  const migratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) return;
    void ensureFolderCounts().catch(() => undefined);
  }, [ensureFolderCounts, isLoaded, user]);

  const applyIds = useCallback((next: Set<string>) => {
    idsSnapshotRef.current = next;
    setIds(next);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      migratedRef.current = null;
      applyIds(new Set(getWatchlistIds()));
      return;
    }
    if (migratedRef.current === user.id) return;
    migratedRef.current = user.id;

    const localIds = getWatchlistIds();
    applyIds(new Set());
    if (localIds.length === 0) return;

    const localSnapshots = getWatchlistSnapshots();
    updateUserCache(user.id, localIds, localSnapshots);
    let active = true;

    Promise.all(
      localIds.map((contentId) => {
        const snapshot = localSnapshots[contentId];
        if (!snapshot) return Promise.resolve();
        return toggleEntry({
          clerkUserId: user.id,
          contentId,
          title: snapshot.title,
          posterUrl: snapshot.posterUrl,
          inWatchlist: true
        }).catch(() => undefined);
      })
    ).then(() => {
      if (active) clearGuestStore();
    });

    return () => {
      active = false;
    };
  }, [applyIds, isLoaded, toggleEntry, user]);

  useEffect(() => {
    if (!isLoaded || !user || remoteIds === undefined) return;
    const nextIds = new Set(remoteIds);
    applyIds(nextIds);
    const cache = getWatchlistCache(user.id);
    updateUserCache(user.id, remoteIds, cache.snapshots);
  }, [applyIds, isLoaded, remoteIds, user]);

  const save = useCallback(
    async (contentId: ContentId, snapshot: WatchlistSnapshot) => {
      const before = idsSnapshotRef.current;
      const alreadySaved = before.has(contentId);
      const after = new Set(before);
      if (alreadySaved) after.delete(contentId);
      else after.add(contentId);
      const opId = ++pendingOpRef.current;
      applyIds(after);

      if (!user) {
        if (alreadySaved) eraseFromGuestStore([contentId]);
        else writeToGuestStore(contentId, snapshot);
        setWatchlistIds([...after]);
        return;
      }

      const previousCache = getWatchlistCache(user.id);
      const nextSnapshots = { ...previousCache.snapshots };
      if (alreadySaved) delete nextSnapshots[contentId];
      else nextSnapshots[contentId] = snapshot;
      updateUserCache(user.id, after, nextSnapshots);

      try {
        await toggleEntry({
          clerkUserId: user.id,
          contentId,
          title: snapshot.title,
          posterUrl: snapshot.posterUrl,
          inWatchlist: !alreadySaved
        });
      } catch (error) {
        setWatchlistCache(user.id, previousCache);
        if (opId === pendingOpRef.current) applyIds(before);
        throw error;
      }
    },
    [applyIds, toggleEntry, user]
  );

  const drop = useCallback(
    async (contentIds: readonly ContentId[]) => {
      const before = idsSnapshotRef.current;
      const removed = new Set<string>(contentIds);
      const after = new Set([...before].filter((id) => !removed.has(id)));
      const opId = ++pendingOpRef.current;
      applyIds(after);

      if (!user) {
        eraseFromGuestStore(removed);
        setWatchlistIds([...after]);
        return;
      }

      const previousCache = getWatchlistCache(user.id);
      const nextSnapshots = { ...previousCache.snapshots };
      for (const contentId of removed) delete nextSnapshots[contentId];
      updateUserCache(user.id, after, nextSnapshots);

      try {
        await dropEntries({ clerkUserId: user.id, contentIds: [...contentIds] });
      } catch (error) {
        setWatchlistCache(user.id, previousCache);
        if (opId === pendingOpRef.current) applyIds(before);
        throw error;
      }
    },
    [applyIds, dropEntries, user]
  );

  const ready = isLoaded && (!user || remoteIds !== undefined);

  return (
    <WatchlistContext.Provider value={{ state: { ids, ready }, save, drop }}>
      {children}
    </WatchlistContext.Provider>
  );
}

function useWatchlistApi() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("GlobalWatchlistProvider not found");
  return ctx;
}

export function useIsInWatchlist(contentId: string | undefined) {
  const { state } = useWatchlistApi();
  return !!contentId && state.ids.has(contentId);
}

export function useToggleWatchlist() {
  return useWatchlistApi().save;
}

export function useWatchlistContentIds(): ContentId[] {
  const { state } = useWatchlistApi();
  return useMemo(() => [...state.ids] as ContentId[], [state.ids]);
}

export function useWatchlistHydrated() {
  return useWatchlistApi().state.ready;
}

export function useMyWatchlistPagination(folder?: string | null, search = "") {
  const { isLoaded, isSignedIn, user } = useUser();
  const { state } = useWatchlistApi();
  const signedIn = isLoaded && isSignedIn && user !== null;

  const { results, status, loadMore } = usePaginatedQuery(
    api.domains.watchlist.watchlist.listWatchlist,
    signedIn
      ? {
          clerkUserId: user.id,
          ...(folder !== undefined ? { folder } : {}),
          ...(search.trim() ? { search: search.trim() } : {})
        }
      : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  const localList = useMemo(() => (signedIn ? [] : listGuestWatchlist()), [signedIn, state.ids]);

  const items = !isLoaded
    ? undefined
    : signedIn
      ? status === "LoadingFirstPage"
        ? undefined
        : (results as WatchlistGridItem[])
      : localList;

  const fetchMore = useCallback(() => loadMore(PAGE_SIZE), [loadMore]);

  return {
    items,
    allItems: items ?? [],
    isLoading: !isLoaded || (status === "LoadingFirstPage" && signedIn),
    isLoadingMore: status === "LoadingMore",
    canLoadMore: status === "CanLoadMore",
    loadMore: fetchMore
  };
}

export function useWatchlistSummary() {
  const { isLoaded, isSignedIn, user } = useUser();
  const signedIn = isLoaded && isSignedIn && user !== null;
  return useQuery(
    api.domains.watchlist.watchlist.listWatchlistSummary,
    signedIn ? { clerkUserId: user.id } : "skip"
  );
}

export function useRemoveWatchlistEntries() {
  return useWatchlistApi().drop;
}

export function useSetWatchlistFolderForEntries() {
  const { user } = useUser();
  const setFolderMany = useMutation(api.domains.watchlist.watchlist.setWatchlistFolderForEntries);
  return useCallback(
    async (contentIds: readonly ContentId[], folder?: string) => {
      if (!user) {
        guestWatchlistPersistence.setFolderMany(contentIds, folder);
        return;
      }
      await setFolderMany({ clerkUserId: user.id, contentIds: [...contentIds], folder });
    },
    [setFolderMany, user]
  );
}

export function useRenameWatchlistFolder() {
  const { user } = useUser();
  const rename = useMutation(api.domains.watchlist.watchlist.renameFolder);
  return useCallback(
    async (from: string, to: string) => {
      if (!user) return;
      await rename({ clerkUserId: user.id, from, to });
    },
    [rename, user]
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
  const remove = useMutation(api.domains.watchlist.watchlist.deleteFolder);
  return useCallback(
    (name: string) => {
      if (!user) return Promise.resolve();
      return remove({ clerkUserId: user.id, name });
    },
    [remove, user]
  );
}

export function useUpdateWatchlistFolder() {
  const { user } = useUser();
  const setFolder = useMutation(api.domains.watchlist.watchlist.setWatchlistFolder);
  return useCallback(
    (
      input: ContentId | { clerkUserId?: string; contentId: ContentId; folder?: string },
      requestedFolder?: string
    ) => {
      const contentId = typeof input === "string" ? input : input.contentId;
      const folder = typeof input === "string" ? requestedFolder : input.folder;
      if (!user) return guestWatchlistPersistence.setFolder(contentId, folder);
      return setFolder({ clerkUserId: user.id, contentId, folder });
    },
    [setFolder, user]
  );
}
