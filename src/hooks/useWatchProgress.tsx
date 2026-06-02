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
import { WATCH_PROGRESS_SYNC_INTERVAL_MS } from "@fishy/providers/providerPlayback";

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
  progressId?: string;
  clientUpdatedAt: number;
  dirty: boolean;
  syncedClientUpdatedAt?: number;
}

type ServerProgress = {
  contentId: string;
  progressId?: string;
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  watchedAt: number;
};

type ProgressStore = {
  version: 3;
  entries: StoredProgress[];
};

const LS_KEY = "watch_progress_v3";
const MAX_ENTRIES = 150;
const FIRST_SYNC_POSITION_SECONDS = 30;
const MIN_PROGRESS_DELTA_TO_SYNC = 5;
const MIN_POSITION_DELTA_TO_SYNC_SECONDS = 300;
const WATCH_PROGRESS_REMOTE_DEBOUNCE_MS = 5_000;

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function normalizeSeconds(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function compactEntries(entries: StoredProgress[]) {
  const byContent = new Map<string, StoredProgress>();
  for (const entry of entries) {
    const existing = byContent.get(entry.contentId);
    if (!existing || entry.clientUpdatedAt >= existing.clientUpdatedAt) {
      byContent.set(entry.contentId, entry);
    }
  }
  return Array.from(byContent.values())
    .sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt)
    .slice(0, MAX_ENTRIES);
}

function toProgressState(entry: StoredProgress | ServerProgress): ProgressState {
  return {
    progress: normalizeProgress(entry.progress),
    positionSeconds: normalizeSeconds(entry.positionSeconds),
    durationSeconds: normalizeSeconds(entry.durationSeconds),
    completed: entry.completed,
    seasonNumber: entry.seasonNumber ?? undefined,
    episodeNumber: entry.episodeNumber ?? undefined,
    source: entry.source ?? undefined,
    dub: entry.dub ?? undefined
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
    seasonNumber: entry[6] ?? undefined,
    episodeNumber: entry[7] ?? undefined,
    source: entry[8] ?? undefined,
    dub: entry[9] ?? undefined,
    progressId: entry[10] ?? undefined
  };
}

function storedFromServer(entry: ServerProgress): StoredProgress {
  return {
    ...toProgressState(entry),
    contentId: entry.contentId,
    progressId: entry.progressId,
    clientUpdatedAt: entry.watchedAt,
    syncedClientUpdatedAt: entry.watchedAt,
    dirty: false
  };
}

function readStore(): StoredProgress[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressStore;
      if (parsed?.version === 3 && Array.isArray(parsed.entries)) {
        return compactEntries(parsed.entries);
      }
    }
  } catch {}

  return [];
}

function writeStore(entries: StoredProgress[]) {
  try {
    const store: ProgressStore = { version: 3, entries: compactEntries(entries) };
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {}
}

function metadataChanged(a: ProgressState, b: ProgressState) {
  return (
    a.completed !== b.completed ||
    a.durationSeconds !== b.durationSeconds ||
    a.seasonNumber !== b.seasonNumber ||
    a.episodeNumber !== b.episodeNumber ||
    a.source !== b.source ||
    a.dub !== b.dub
  );
}

function shouldDirtyEntry(next: StoredProgress, baseline: StoredProgress | undefined) {
  if (next.completed && !baseline?.completed) return true;
  if (!baseline) return next.positionSeconds >= FIRST_SYNC_POSITION_SECONDS || next.progress >= 1;
  if (baseline.dirty) return true;
  if (metadataChanged(next, baseline)) return true;
  if (Math.abs(next.progress - baseline.progress) >= MIN_PROGRESS_DELTA_TO_SYNC) return true;
  if (
    Math.abs(next.positionSeconds - baseline.positionSeconds) >= MIN_POSITION_DELTA_TO_SYNC_SECONDS
  ) {
    return true;
  }
  return false;
}

function syncedBaselineFrom(entry: StoredProgress): StoredProgress {
  return {
    ...entry,
    dirty: false,
    syncedClientUpdatedAt: entry.clientUpdatedAt
  };
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
  const fetchedUserRef = useRef<string | null>(null);

  const [map, setMap] = useState<ProgressMap>(() => {
    return new Map(readStore().map((entry) => [entry.contentId, toProgressState(entry)]));
  });

  useEffect(() => {
    if (!user) {
      fetchedUserRef.current = null;
      return;
    }
    if (fetchedUserRef.current === user.id) return;
    fetchedUserRef.current = user.id;

    convex
      .query(api.watchHistory.listWatchProgressEntries, { clerkUserId: user.id })
      .then((serverItems) => {
        const localById = new Map(readStore().map((entry) => [entry.contentId, entry]));

        for (const compactServerItem of serverItems) {
          const serverItem = toServerProgress(compactServerItem);
          const local = localById.get(serverItem.contentId);
          if (local && local.clientUpdatedAt >= serverItem.watchedAt) continue;
          localById.set(serverItem.contentId, storedFromServer(serverItem));
        }

        const merged = compactEntries(Array.from(localById.values()));
        writeStore(merged);
        setMap(new Map(merged.map((entry) => [entry.contentId, toProgressState(entry)])));
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
  return readStore().find((entry) => entry.contentId === contentId);
}

export function useWatchProgressContext(): ProgressMap | undefined {
  const ctx = useContext(Ctx);
  return ctx?.map;
}

export function useUpdateProgress() {
  const { user } = useUser();
  const ctx = useContext(Ctx);
  const dbSync = useMutation(api.watchHistory.saveWatchProgress);

  const storeRef = useRef<Map<string, StoredProgress>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    storeRef.current = new Map(readStore().map((entry) => [entry.contentId, entry]));
  }, []);

  const persistCurrentStore = useCallback(() => {
    writeStore(Array.from(storeRef.current.values()));
  }, []);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flushToDb = useCallback(async (force = false) => {
    if (!user || syncingRef.current) return;

    const dirtyEntry = Array.from(storeRef.current.values())
      .filter((entry) => entry.dirty)
      .sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt)
      .at(0);
    if (!dirtyEntry) return;
    if (!force && Date.now() - dirtyEntry.clientUpdatedAt < WATCH_PROGRESS_REMOTE_DEBOUNCE_MS) {
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void flushToDb();
        }, WATCH_PROGRESS_REMOTE_DEBOUNCE_MS);
      }
      return;
    }

    syncingRef.current = true;
    let saved = false;

    try {
      const savedProgressId = await dbSync({
        clerkUserId: user.id,
        progressId: dirtyEntry.progressId as Id<"watchProgress"> | undefined,
        contentId: dirtyEntry.contentId as Id<"content">,
        progress: Math.round(dirtyEntry.progress * 10) / 10,
        completed: dirtyEntry.completed,
        positionSeconds: Math.round(dirtyEntry.positionSeconds),
        durationSeconds: Math.round(dirtyEntry.durationSeconds),
        seasonNumber: dirtyEntry.seasonNumber,
        episodeNumber: dirtyEntry.episodeNumber,
        source: dirtyEntry.source,
        dub: dirtyEntry.dub,
        clientUpdatedAt: dirtyEntry.clientUpdatedAt
      });
      saved = true;

      const current = storeRef.current.get(dirtyEntry.contentId);
      if (current && current.clientUpdatedAt <= dirtyEntry.clientUpdatedAt) {
        storeRef.current.set(dirtyEntry.contentId, {
          ...current,
          progressId: savedProgressId ?? current.progressId,
          dirty: false,
          syncedClientUpdatedAt: dirtyEntry.clientUpdatedAt
        });
      } else if (current) {
        const syncedBaseline = syncedBaselineFrom(dirtyEntry);
        const remainsDirty = shouldDirtyEntry(
          {
            ...current,
            dirty: false,
            syncedClientUpdatedAt: dirtyEntry.clientUpdatedAt
          },
          syncedBaseline
        );
        storeRef.current.set(dirtyEntry.contentId, {
          ...current,
          progressId: savedProgressId ?? current.progressId,
          dirty: remainsDirty,
          syncedClientUpdatedAt: dirtyEntry.clientUpdatedAt
        });
      }
      persistCurrentStore();
    } catch {
      const current = storeRef.current.get(dirtyEntry.contentId);
      if (current) {
        storeRef.current.set(dirtyEntry.contentId, {
          ...current,
          progressId: dirtyEntry.progressId ? undefined : current.progressId,
          dirty: true
        });
      }
      persistCurrentStore();
    } finally {
      syncingRef.current = false;
      const hasMoreDirtyEntries = Array.from(storeRef.current.values()).some((entry) => entry.dirty);
      if (saved && hasMoreDirtyEntries && !timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void flushToDb();
        }, WATCH_PROGRESS_REMOTE_DEBOUNCE_MS);
      }
    }
  }, [dbSync, persistCurrentStore, user]);

  const scheduleFlush = useCallback(
    (delayMs = WATCH_PROGRESS_SYNC_INTERVAL_MS) => {
      if (!user || timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flushToDb();
      }, delayMs);
    },
    [flushToDb, user]
  );

  useEffect(() => {
    if (!user) return;
    const dirtyEntries = Array.from(storeRef.current.values()).filter((entry) => entry.dirty);
    if (dirtyEntries.length === 0) return;

    const oldestDirtyAt = Math.min(...dirtyEntries.map((entry) => entry.clientUpdatedAt));
    const age = Date.now() - oldestDirtyAt;
    scheduleFlush(Math.max(0, WATCH_PROGRESS_SYNC_INTERVAL_MS - age));
  }, [scheduleFlush, user]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushToDb(true);
    };
    const onOnline = () => scheduleFlush(0);

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
      clearTimer();
      void flushToDb(true);
    };
  }, [clearTimer, flushToDb, scheduleFlush]);

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
      const previous = storeRef.current.get(contentId);
      const state: ProgressState = {
        progress: normalizeProgress(progress),
        completed,
        positionSeconds: normalizeSeconds(positionSeconds),
        durationSeconds: normalizeSeconds(durationSeconds),
        seasonNumber,
        episodeNumber,
        source,
        dub
      };
      const next: StoredProgress = {
        ...state,
        contentId,
        progressId: previous?.progressId,
        clientUpdatedAt: Date.now(),
        dirty: false,
        syncedClientUpdatedAt: previous?.syncedClientUpdatedAt
      };

      next.dirty = shouldDirtyEntry(next, previous);
      storeRef.current.set(contentId, next);
      persistCurrentStore();
      ctx?.setEntry(contentId, state);

      if (next.dirty) scheduleFlush();
    },
    [ctx, persistCurrentStore, scheduleFlush]
  );
}
