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
  clientUpdatedAt: number;
  dirty: boolean;
  syncedClientUpdatedAt?: number;
}

type ServerProgress = {
  contentId: string;
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
  version: 2;
  entries: StoredProgress[];
};

const LS_KEY = "watch_progress_v2";
const LEGACY_LS_KEY = "watch_progress";
const MAX_ENTRIES = 150;
const MAX_BATCH_SIZE = 25;
const FIRST_SYNC_POSITION_SECONDS = 30;
const MIN_PROGRESS_DELTA_TO_SYNC = 5;
const MIN_POSITION_DELTA_TO_SYNC_SECONDS = 300;

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
    dub: entry[9] ?? undefined
  };
}

function storedFromServer(entry: ServerProgress): StoredProgress {
  return {
    ...toProgressState(entry),
    contentId: entry.contentId,
    clientUpdatedAt: entry.watchedAt,
    syncedClientUpdatedAt: entry.watchedAt,
    dirty: false
  };
}

function migrateLegacyEntries(): StoredProgress[] {
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<
      ProgressState & { contentId?: string; lastUpdated?: number; needsSync?: boolean }
    >;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry.contentId)
      .map((entry) => ({
        progress: normalizeProgress(entry.progress),
        positionSeconds: normalizeSeconds(entry.positionSeconds),
        durationSeconds: normalizeSeconds(entry.durationSeconds),
        completed: entry.completed,
        seasonNumber: entry.seasonNumber,
        episodeNumber: entry.episodeNumber,
        source: entry.source,
        dub: entry.dub,
        contentId: entry.contentId!,
        clientUpdatedAt: entry.lastUpdated ?? Date.now(),
        syncedClientUpdatedAt: entry.needsSync ? undefined : entry.lastUpdated,
        dirty: !!entry.needsSync
      }));
  } catch {
    return [];
  }
}

function readStore(): StoredProgress[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressStore;
      if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
        return compactEntries(parsed.entries);
      }
    }
  } catch {}

  const migrated = migrateLegacyEntries();
  if (migrated.length > 0) writeStore(migrated);
  return migrated;
}

function writeStore(entries: StoredProgress[]) {
  try {
    const store: ProgressStore = { version: 2, entries: compactEntries(entries) };
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
  return (
    next.clientUpdatedAt - (baseline.syncedClientUpdatedAt ?? baseline.clientUpdatedAt) >=
    WATCH_PROGRESS_SYNC_INTERVAL_MS
  );
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
  const dbSync = useMutation(api.watchHistory.saveWatchProgressBatch);

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

  const flushToDb = useCallback(async () => {
    if (!user || syncingRef.current) return;

    const dirtyEntries = Array.from(storeRef.current.values())
      .filter((entry) => entry.dirty)
      .sort((a, b) => a.clientUpdatedAt - b.clientUpdatedAt)
      .slice(0, MAX_BATCH_SIZE);
    if (dirtyEntries.length === 0) return;

    syncingRef.current = true;

    try {
      await dbSync({
        clerkUserId: user.id,
        entries: dirtyEntries.map((entry) => ({
          contentId: entry.contentId as Id<"content">,
          progress: entry.progress,
          completed: entry.completed,
          positionSeconds: entry.positionSeconds,
          durationSeconds: entry.durationSeconds,
          seasonNumber: entry.seasonNumber,
          episodeNumber: entry.episodeNumber,
          source: entry.source,
          dub: entry.dub,
          clientUpdatedAt: entry.clientUpdatedAt
        }))
      });

      for (const sent of dirtyEntries) {
        const current = storeRef.current.get(sent.contentId);
        if (!current || current.clientUpdatedAt > sent.clientUpdatedAt) continue;
        storeRef.current.set(sent.contentId, {
          ...current,
          dirty: false,
          syncedClientUpdatedAt: sent.clientUpdatedAt
        });
      }
      persistCurrentStore();
    } catch {
      for (const entry of dirtyEntries) {
        const current = storeRef.current.get(entry.contentId);
        if (current) storeRef.current.set(entry.contentId, { ...current, dirty: true });
      }
      persistCurrentStore();
    } finally {
      syncingRef.current = false;
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
      if (document.visibilityState === "hidden") void flushToDb();
    };
    const onOnline = () => scheduleFlush(0);

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
      clearTimer();
      void flushToDb();
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
