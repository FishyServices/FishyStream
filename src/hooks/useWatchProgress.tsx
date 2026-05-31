import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode
} from "react";
import { useMutation, useConvex } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { WatchProgressEntryMeta } from "../../shared/contentMetadata";

export interface ProgressState {
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}

interface StoredProgress extends ProgressState {
  contentId: string;
  lastUpdated: number;
  needsSync: boolean;
}

type ServerProgress = {
  contentId: string;
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber: number | null;
  episodeNumber: number | null;
  source: string | null;
  dub: boolean | null;
  watchedAt: number;
};

const LS_KEY = "watch_progress";
const MAX_ENTRIES = 100;
const FLUSH_DEBOUNCE_MS = 120_000;
const MIN_PROGRESS_DELTA_TO_SYNC = 10;
const MIN_POSITION_DELTA_TO_SYNC_SECONDS = 60;
const MAX_STALE_SYNC_MS = 10 * 60_000;

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function lsGetAll(): StoredProgress[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as StoredProgress[]) : [];
  } catch {
    return [];
  }
}

function lsSetAll(data: StoredProgress[]) {
  try {
    const sorted = [...data].sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, MAX_ENTRIES);
    localStorage.setItem(LS_KEY, JSON.stringify(sorted));
  } catch {}
}

function toProgressState(entry: StoredProgress | ServerProgress): ProgressState {
  return {
    progress: entry.progress,
    positionSeconds: entry.positionSeconds,
    durationSeconds: entry.durationSeconds,
    completed: entry.completed,
    seasonNumber: entry.seasonNumber ?? undefined,
    episodeNumber: entry.episodeNumber ?? undefined,
    source: "source" in entry ? (entry.source ?? undefined) : undefined,
    dub: "dub" in entry ? (entry.dub ?? undefined) : undefined
  };
}

function toServerProgress(entry: WatchProgressEntryMeta): ServerProgress {
  return {
    contentId: entry[0],
    progress: entry[1],
    positionSeconds: entry[2],
    durationSeconds: entry[3],
    completed: entry[4],
    watchedAt: entry[5],
    seasonNumber: entry[6] ?? null,
    episodeNumber: entry[7] ?? null,
    source: entry[8] ?? null,
    dub: entry[9] ?? null
  };
}

function isStoredProgressNewer(local: StoredProgress, remote: ServerProgress): boolean {
  if (local.needsSync) return true;
  return local.lastUpdated >= remote.watchedAt;
}

type ProgressMap = Map<string, ProgressState>;
type ProgressCtx = {
  map: ProgressMap;
  setEntry: (id: string, state: ProgressState) => void;
};

const Ctx = createContext<ProgressCtx | undefined>(undefined);

export function WatchProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const convex = useConvex();
  const fetchedRef = useRef(false);

  const [map, setMap] = useState<ProgressMap>(() => {
    const next = new Map<string, ProgressState>();
    for (const entry of lsGetAll()) {
      next.set(entry.contentId, toProgressState(entry));
    }
    return next;
  });

  useEffect(() => {
    if (!user) {
      fetchedRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user || fetchedRef.current) return;
    fetchedRef.current = true;

    convex
      .query(api.watchHistory.listWatchProgressEntries, { clerkUserId: user.id })
      .then((serverItems) => {
        const localEntries = new Map(lsGetAll().map((entry) => [entry.contentId, entry]));
        const mergedEntries = new Map(localEntries);

        for (const compactServerItem of serverItems) {
          const serverItem = toServerProgress(compactServerItem);
          const local = localEntries.get(serverItem.contentId);
          if (!local || !isStoredProgressNewer(local, serverItem)) {
            mergedEntries.set(serverItem.contentId, {
              ...toProgressState(serverItem),
              contentId: serverItem.contentId,
              lastUpdated: serverItem.watchedAt,
              needsSync: false
            });
          }
        }

        const mergedList = Array.from(mergedEntries.values());
        lsSetAll(mergedList);
        setMap(new Map(mergedList.map((entry) => [entry.contentId, toProgressState(entry)])));
      })
      .catch(() => {});
  }, [convex, user]);

  const setEntry = useCallback((id: string, state: ProgressState) => {
    setMap((prev) => {
      const next = new Map(prev);
      next.set(id, state);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ map, setEntry }}>{children}</Ctx.Provider>;
}

export function useGetProgress(contentId: Id<"content"> | undefined): ProgressState | undefined {
  const ctx = useContext(Ctx);
  if (!contentId) return undefined;
  if (ctx) return ctx.map.get(contentId);
  return lsGetAll().find((entry) => entry.contentId === contentId);
}

export function useWatchProgressContext(): ProgressMap | undefined {
  const ctx = useContext(Ctx);
  return ctx?.map;
}

export function useUpdateProgress() {
  const { user } = useUser();
  const ctx = useContext(Ctx);
  const dbSync = useMutation(api.watchHistory.saveWatchProgress);

  const pendingRef = useRef<Map<string, StoredProgress>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    for (const entry of lsGetAll()) {
      if (entry.needsSync) {
        pendingRef.current.set(entry.contentId, entry);
      }
    }
  }, []);

  const persistEntry = useCallback((entry: StoredProgress) => {
    const all = lsGetAll().filter((item) => item.contentId !== entry.contentId);
    lsSetAll([...all, entry]);
  }, []);

  const shouldQueueSync = useCallback((next: StoredProgress) => {
    const currentPending = pendingRef.current.get(next.contentId);
    const currentStored = lsGetAll().find((item) => item.contentId === next.contentId);
    const baseline = currentPending ?? currentStored;
    if (!baseline) return true;

    const positionDelta = Math.abs(next.positionSeconds - baseline.positionSeconds);
    const progressDelta = Math.abs(next.progress - baseline.progress);
    const metadataChanged =
      baseline.completed !== next.completed ||
      baseline.durationSeconds !== next.durationSeconds ||
      baseline.seasonNumber !== next.seasonNumber ||
      baseline.episodeNumber !== next.episodeNumber ||
      baseline.source !== next.source ||
      baseline.dub !== next.dub;

    if (metadataChanged) return true;
    if (next.completed && !baseline.completed) return true;
    if (progressDelta >= MIN_PROGRESS_DELTA_TO_SYNC) return true;
    if (positionDelta >= MIN_POSITION_DELTA_TO_SYNC_SECONDS) return true;
    if (next.lastUpdated - baseline.lastUpdated >= MAX_STALE_SYNC_MS) return true;

    return false;
  }, []);

  const flushToDb = useCallback(async () => {
    if (!user || syncingRef.current || pendingRef.current.size === 0) return;

    const batch = Array.from(pendingRef.current.values());
    syncingRef.current = true;

    try {
      for (const entry of batch) {
        await dbSync({
          clerkUserId: user.id,
          contentId: entry.contentId as Id<"content">,
          progress: entry.progress,
          completed: entry.completed,
          positionSeconds: entry.positionSeconds,
          durationSeconds: entry.durationSeconds,
          seasonNumber: entry.seasonNumber,
          episodeNumber: entry.episodeNumber,
          source: entry.source,
          dub: entry.dub
        });

        pendingRef.current.delete(entry.contentId);
        persistEntry({ ...entry, needsSync: false });
      }
    } catch {
      for (const entry of batch) {
        pendingRef.current.set(entry.contentId, entry);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [dbSync, persistEntry, user]);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushToDb();
    }, FLUSH_DEBOUNCE_MS);
  }, [flushToDb]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void flushToDb();
      }
    };

    const onUnload = () => {
      void flushToDb();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
      void flushToDb();
    };
  }, [flushToDb]);

  useEffect(() => {
    if (user && pendingRef.current.size > 0) {
      scheduleFlush();
    }
  }, [scheduleFlush, user]);

  return useCallback(
    (
      contentId: Id<"content">,
      progress: number,
      completed = false,
      positionSeconds = 0,
      durationSeconds = 0,
      seasonNumber?: number,
      episodeNumber?: number,
      source?: string,
      dub?: boolean
    ) => {
      const entry: StoredProgress = {
        contentId,
        progress: normalizeProgress(progress),
        completed,
        positionSeconds: Math.max(0, positionSeconds),
        durationSeconds: Math.max(0, durationSeconds),
        seasonNumber,
        episodeNumber,
        source,
        dub,
        lastUpdated: Date.now(),
        needsSync: false
      };

      entry.needsSync = shouldQueueSync(entry);
      if (entry.needsSync) {
        pendingRef.current.set(contentId, entry);
      }
      persistEntry(entry);
      ctx?.setEntry(contentId, toProgressState(entry));

      if (user && entry.needsSync) {
        scheduleFlush();
      }
    },
    [ctx, persistEntry, scheduleFlush, shouldQueueSync, user]
  );
}
