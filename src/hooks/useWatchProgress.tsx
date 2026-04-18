import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode
} from "react";
import { useMutation, useAction } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export interface ProgressState {
  progress: number; // 0-100
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
}

interface StoredProgress extends ProgressState {
  contentId: string;
  lastUpdated: number;
  needsSync: boolean;
}

const LS_KEY = "watch_progress";
const DB_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 min

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
    const sorted = [...data].sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, 100);
    localStorage.setItem(LS_KEY, JSON.stringify(sorted));
  } catch {}
}

function lsUpsert(entry: StoredProgress) {
  const all = lsGetAll().filter((p) => p.contentId !== entry.contentId);
  lsSetAll([...all, entry]);
}

type ProgressMap = Map<string, ProgressState>;
type ProgressCtx = {
  map: ProgressMap;
  setEntry: (id: string, state: ProgressState) => void;
};

const Ctx = createContext<ProgressCtx | undefined>(undefined);

export function WatchProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const fetchAll = useAction(api.watchHistory.getAllWatchProgressAction);
  const fetchedRef = useRef(false);

  const [map, setMap] = useState<ProgressMap>(() => {
    const m = new Map<string, ProgressState>();
    for (const p of lsGetAll()) {
      m.set(p.contentId, {
        progress: p.progress,
        positionSeconds: p.positionSeconds,
        durationSeconds: p.durationSeconds,
        completed: p.completed,
        seasonNumber: p.seasonNumber,
        episodeNumber: p.episodeNumber
      });
    }
    return m;
  });

  useEffect(() => {
    if (!user || fetchedRef.current) return;
    fetchedRef.current = true;

    fetchAll({ clerkUserId: user.id })
      .then((serverItems) => {
        setMap((prev) => {
          const next = new Map(prev);
          for (const item of serverItems) {
            const existing = next.get(item.contentId);
            if (!existing || item.progress > existing.progress) {
              next.set(item.contentId, {
                progress: item.progress,
                positionSeconds: item.positionSeconds,
                durationSeconds: item.durationSeconds,
                completed: item.completed,
                seasonNumber: item.seasonNumber ?? undefined,
                episodeNumber: item.episodeNumber ?? undefined
              });
            }
          }
          lsSetAll(
            Array.from(next.entries()).map(([contentId, p]) => ({
              contentId,
              ...p,
              lastUpdated: Date.now(),
              needsSync: false
            }))
          );
          return next;
        });
      })
      .catch(() => {});
  }, [user]);

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
  return lsGetAll().find((p) => p.contentId === contentId);
}

export function useUpdateProgress() {
  const { user } = useUser();
  const ctx = useContext(Ctx);
  const dbSync = useMutation(api.watchHistory.updateProgress);

  const pendingRef = useRef<StoredProgress | null>(null);
  const lastDbSyncAtRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushToDb = useCallback(
    async (force = false) => {
      if (!user || !pendingRef.current?.needsSync) return;
      const elapsed = Date.now() - lastDbSyncAtRef.current;
      if (!force && elapsed < 30_000) return;
      const p = pendingRef.current;
      try {
        await dbSync({
          clerkUserId: user.id,
          contentId: p.contentId as Id<"content">,
          progress: p.progress,
          completed: p.completed,
          positionSeconds: p.positionSeconds,
          durationSeconds: p.durationSeconds,
          seasonNumber: p.seasonNumber,
          episodeNumber: p.episodeNumber
        });
        pendingRef.current = { ...p, needsSync: false };
        lsUpsert(pendingRef.current);
        lastDbSyncAtRef.current = Date.now();
      } catch {}
    },
    [user, dbSync]
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushToDb();
    };
    const onUnload = () => flushToDb(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      flushToDb(true);
    };
  }, [flushToDb]);

  return useCallback(
    (
      contentId: Id<"content">,
      progress: number,
      completed = false,
      positionSeconds = 0,
      durationSeconds = 0,
      seasonNumber?: number,
      episodeNumber?: number
    ) => {
      const entry: StoredProgress = {
        contentId,
        progress: Math.max(0, Math.min(100, progress)),
        completed,
        positionSeconds,
        durationSeconds,
        seasonNumber,
        episodeNumber,
        lastUpdated: Date.now(),
        needsSync: true
      };

      pendingRef.current = entry;
      lsUpsert(entry);
      ctx?.setEntry(contentId, entry);

      const elapsed = Date.now() - lastDbSyncAtRef.current;
      if (elapsed >= DB_SYNC_INTERVAL_MS) {
        return flushToDb(true);
      } else if (!syncTimerRef.current) {
        syncTimerRef.current = setTimeout(() => {
          syncTimerRef.current = null;
          void flushToDb(true);
        }, DB_SYNC_INTERVAL_MS);
      }
    },
    [ctx, flushToDb]
  );
}
