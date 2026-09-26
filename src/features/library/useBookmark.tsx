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
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../../convex/_generated/api";
import { parseContentId, type ContentId, type BookmarkGridItem } from "@content/contentMetadata";
import { guestBookmarkPersistence, listGuestBookmark } from "./persistence";
import {
  getBookmarkIds,
  getBookmarkCache,
  getBookmarkSnapshots,
  getBookmarkTmdbMap,
  setBookmarkIds,
  setBookmarkCache,
  setBookmarkSnapshots,
  setBookmarkTmdbMap,
  type LocalContentSnapshot as BookmarkSnapshot
} from "@/shared/storage/localStorageStore";

const PAGE_SIZE = 20;

export type { BookmarkSnapshot };

type SavedState = {
  ids: Set<string>;
  ready: boolean;
};

type BookmarkApi = {
  state: SavedState;
  save: (contentId: ContentId, snapshot: BookmarkSnapshot) => Promise<void>;
  drop: (contentIds: readonly ContentId[]) => Promise<void>;
};

const BookmarkContext = createContext<BookmarkApi | null>(null);

function eraseFromGuestStore(ids: Iterable<string>) {
  const snapshots = { ...getBookmarkSnapshots() };
  const tmdbMap = { ...getBookmarkTmdbMap() };
  for (const id of ids) {
    delete snapshots[id];
    delete tmdbMap[id];
  }
  setBookmarkSnapshots(snapshots);
  setBookmarkTmdbMap(tmdbMap);
}

function writeToGuestStore(contentId: string, snapshot: BookmarkSnapshot) {
  setBookmarkSnapshots({ ...getBookmarkSnapshots(), [contentId]: snapshot });
  setBookmarkTmdbMap({ ...getBookmarkTmdbMap(), [contentId]: snapshot.tmdbId });
}

function clearGuestStore() {
  setBookmarkIds([]);
  setBookmarkSnapshots({});
  setBookmarkTmdbMap({});
}

function updateUserCache(
  userId: string,
  ids: Iterable<string>,
  snapshots: Record<string, BookmarkSnapshot>
) {
  setBookmarkCache(userId, {
    ids: [...new Set(ids)].filter((id): id is ContentId => parseContentId(id) !== null),
    snapshots
  });
}

export function GlobalBookmarkProvider({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const remoteIds = useQuery(
    api.domains.bookmark.bookmark.listBookmarkContentIds,
    user && isAuthenticated ? {} : "skip"
  );
  const toggleEntry = useMutation(api.domains.bookmark.bookmark.toggleBookmarkEntry);
  const dropEntries = useMutation(api.domains.bookmark.bookmark.removeBookmarkEntries);

  const [ids, setIds] = useState<Set<string>>(() => new Set(getBookmarkIds()));
  const idsSnapshotRef = useRef(ids);
  const pendingOpRef = useRef(0);
  const migratedRef = useRef<string | null>(null);

  const applyIds = useCallback((next: Set<string>) => {
    idsSnapshotRef.current = next;
    setIds(next);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      migratedRef.current = null;
      applyIds(new Set(getBookmarkIds()));
      return;
    }
    if (migratedRef.current === user.id) return;
    migratedRef.current = user.id;

    const localIds = getBookmarkIds();
    applyIds(new Set());
    if (localIds.length === 0) return;

    const localSnapshots = getBookmarkSnapshots();
    updateUserCache(user.id, localIds, localSnapshots);
    let active = true;

    Promise.all(
      localIds.map((contentId) => {
        const snapshot = localSnapshots[contentId];
        if (!snapshot) return Promise.resolve();
        return toggleEntry({
          contentId,
          title: snapshot.title,
          posterUrl: snapshot.posterUrl,
          inBookmark: true
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
    const cache = getBookmarkCache(user.id);
    updateUserCache(user.id, remoteIds, cache.snapshots);
  }, [applyIds, isLoaded, remoteIds, user]);

  const save = useCallback(
    async (contentId: ContentId, snapshot: BookmarkSnapshot) => {
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
        setBookmarkIds([...after]);
        return;
      }

      const previousCache = getBookmarkCache(user.id);
      const nextSnapshots = { ...previousCache.snapshots };
      if (alreadySaved) delete nextSnapshots[contentId];
      else nextSnapshots[contentId] = snapshot;
      updateUserCache(user.id, after, nextSnapshots);

      try {
        await toggleEntry({
          contentId,
          title: snapshot.title,
          posterUrl: snapshot.posterUrl,
          inBookmark: !alreadySaved
        });
      } catch (error) {
        setBookmarkCache(user.id, previousCache);
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
        setBookmarkIds([...after]);
        return;
      }

      const previousCache = getBookmarkCache(user.id);
      const nextSnapshots = { ...previousCache.snapshots };
      for (const contentId of removed) delete nextSnapshots[contentId];
      updateUserCache(user.id, after, nextSnapshots);

      try {
        await dropEntries({ contentIds: [...contentIds] });
      } catch (error) {
        setBookmarkCache(user.id, previousCache);
        if (opId === pendingOpRef.current) applyIds(before);
        throw error;
      }
    },
    [applyIds, dropEntries, user]
  );

  const ready = isLoaded && (!user || remoteIds !== undefined);

  return (
    <BookmarkContext.Provider value={{ state: { ids, ready }, save, drop }}>
      {children}
    </BookmarkContext.Provider>
  );
}

function useBookmarkApi() {
  const ctx = useContext(BookmarkContext);
  if (!ctx) throw new Error("GlobalBookmarkProvider not found");
  return ctx;
}

export function useIsInBookmark(contentId: string | undefined) {
  const { state } = useBookmarkApi();
  return !!contentId && state.ids.has(contentId);
}

export function useCheckBookmarkStatus(contentIds: string[]): Record<string, boolean> {
  const { state } = useBookmarkApi();
  return useMemo(() => {
    const statusMap: Record<string, boolean> = {};
    for (const id of contentIds) {
      if (id) statusMap[id] = state.ids.has(id);
    }
    return statusMap;
  }, [contentIds, state.ids]);
}

export function useToggleBookmark() {
  return useBookmarkApi().save;
}

export function useBookmarkContentIds(): ContentId[] {
  const { state } = useBookmarkApi();
  return useMemo(() => [...state.ids] as ContentId[], [state.ids]);
}

export function useBookmarkHydrated() {
  return useBookmarkApi().state.ready;
}

export function useBookmarkPagination(folder?: string | null, search = "") {
  const { isLoaded, isSignedIn, user } = useUser();
  const { state } = useBookmarkApi();
  const signedIn = isLoaded && isSignedIn && user !== null;

  const { results, status, loadMore } = usePaginatedQuery(
    api.domains.bookmark.bookmark.listBookmark,
    signedIn
      ? {
          ...(folder !== undefined ? { folder } : {}),
          ...(search.trim() ? { search: search.trim() } : {})
        }
      : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  const localList = useMemo(() => (signedIn ? [] : listGuestBookmark()), [signedIn, state.ids]);

  const items = !isLoaded
    ? undefined
    : signedIn
      ? status === "LoadingFirstPage"
        ? undefined
        : (results as BookmarkGridItem[])
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

export function useBookmarkSummary() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  return useQuery(
    api.domains.bookmark.bookmark.listBookmarkSummary,
    user && isAuthenticated ? {} : "skip"
  );
}

export function useRemoveBookmarkEntries() {
  return useBookmarkApi().drop;
}

export function useSetBookmarkFolderForEntries() {
  const { user } = useUser();
  const setFolderMany = useMutation(api.domains.bookmark.bookmark.setBookmarkFolderForEntries);
  return useCallback(
    async (contentIds: readonly ContentId[], folder?: string) => {
      if (!user) {
        guestBookmarkPersistence.setFolderMany(contentIds, folder);
        return;
      }
      await setFolderMany({ contentIds: [...contentIds], folder });
    },
    [setFolderMany, user]
  );
}

export function useRenameBookmarkFolder() {
  const { user } = useUser();
  const rename = useMutation(api.domains.bookmark.bookmark.renameFolder);
  return useCallback(
    async (from: string, to: string) => {
      if (!user) return;
      await rename({ from, to });
    },
    [rename, user]
  );
}

export function useBookmarks() {
  return useBookmarkPagination().items;
}

export function useAllBookmarks() {
  return useAllBookmarksState().items;
}

export function useAllBookmarksState() {
  const pagination = useBookmarkPagination();

  useEffect(() => {
    if (!pagination.canLoadMore || pagination.isLoadingMore) return;
    pagination.loadMore();
  }, [pagination.canLoadMore, pagination.isLoadingMore, pagination.loadMore]);

  return {
    items: pagination.allItems,
    isLoading: pagination.isLoading || pagination.isLoadingMore || pagination.canLoadMore
  };
}

export function useBookmarkFolders() {
  const summary = useBookmarkSummary();
  return useMemo(() => summary?.folders.map((folder) => folder.name), [summary]);
}

export function useDeleteBookmarkFolder() {
  const { user } = useUser();
  const remove = useMutation(api.domains.bookmark.bookmark.deleteFolder);
  return useCallback(
    (name: string) => {
      if (!user) return Promise.resolve();
      return remove({ name });
    },
    [remove, user]
  );
}

export function useUpdateBookmarkFolder() {
  const { user } = useUser();
  const setFolder = useMutation(api.domains.bookmark.bookmark.setBookmarkFolder);
  return useCallback(
    (input: ContentId | { contentId: ContentId; folder?: string }, requestedFolder?: string) => {
      const contentId = typeof input === "string" ? input : input.contentId;
      const folder = typeof input === "string" ? requestedFolder : input.folder;
      if (!user) return guestBookmarkPersistence.setFolder(contentId, folder);
      return setFolder({ contentId, folder });
    },
    [setFolder, user]
  );
}
