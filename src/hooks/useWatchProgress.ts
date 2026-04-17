import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";

const DB_SYNC_INTERVAL = 10 * 60 * 1000;
const LOCAL_STORAGE_KEY = "watch_progress_local";

interface LocalProgress {
  contentId: string;
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  lastUpdated: number;
  needsSync: boolean;
}

interface ProgressState {
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
}

function getLocalStorage(): LocalProgress[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setLocalStorage(data: LocalProgress[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.slice(-100)));
  } catch {}
}

function getLocalProgress(contentId: string): LocalProgress | undefined {
  return getLocalStorage().find((p) => p.contentId === contentId);
}

function saveLocalProgress(progress: LocalProgress) {
  const all = getLocalStorage().filter((p) => p.contentId !== progress.contentId);
  all.push(progress);
  setLocalStorage(all);
}

export function useGetWatchProgress(contentId: Id<"content"> | undefined) {
  const { user } = useUser();
  const serverProgress = useQuery(
    api.watchHistory.getWatchProgress,
    user && contentId ? { clerkUserId: user.id, contentId } : "skip"
  );

  const [localState, setLocalState] = useState<ProgressState | undefined>();

  useEffect(() => {
    if (!contentId) {
      setLocalState(undefined);
      return;
    }

    const local = getLocalProgress(contentId);

    if (local && !serverProgress) {
      setLocalState({
        progress: local.progress,
        positionSeconds: local.positionSeconds,
        durationSeconds: local.durationSeconds,
        completed: local.completed,
        seasonNumber: local.seasonNumber,
        episodeNumber: local.episodeNumber
      });
    } else if (serverProgress) {
      setLocalState({
        progress: serverProgress.progress,
        positionSeconds: serverProgress.positionSeconds || 0,
        durationSeconds: serverProgress.durationSeconds || 0,
        completed: serverProgress.completed,
        seasonNumber: serverProgress.seasonNumber ?? undefined,
        episodeNumber: serverProgress.episodeNumber ?? undefined
      });
    }
  }, [contentId, serverProgress]);

  return localState ?? serverProgress;
}

export function useUpdateProgress() {
  const { user } = useUser();
  const updateMutation = useMutation(api.watchHistory.updateProgress);
  const localRef = useRef<LocalProgress | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  const syncToDb = useCallback(async (): Promise<void> => {
    if (!user || !localRef.current || !localRef.current.needsSync) return;

    const now = Date.now();
    if (now - lastSyncRef.current < 5000) return;

    lastSyncRef.current = now;

    try {
      await updateMutation({
        clerkUserId: user.id,
        contentId: localRef.current.contentId as Id<"content">,
        progress: localRef.current.progress,
        completed: localRef.current.completed,
        positionSeconds: localRef.current.positionSeconds,
        durationSeconds: localRef.current.durationSeconds,
        seasonNumber: localRef.current.seasonNumber,
        episodeNumber: localRef.current.episodeNumber
      });

      localRef.current.needsSync = false;
      saveLocalProgress(localRef.current);
    } catch {}
  }, [user, updateMutation]);

  const scheduleSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncToDb();
    }, DB_SYNC_INTERVAL);
  }, [syncToDb]);

  const updateProgress = useCallback(
    (
      contentId: Id<"content">,
      progress: number,
      completed: boolean = false,
      positionSeconds: number = 0,
      durationSeconds: number = 0,
      seasonNumber?: number,
      episodeNumber?: number
    ): Promise<void> => {
      const now = Date.now();

      localRef.current = {
        contentId,
        progress,
        positionSeconds,
        durationSeconds,
        completed,
        seasonNumber,
        episodeNumber,
        lastUpdated: now,
        needsSync: true
      };

      saveLocalProgress(localRef.current);

      const timeSinceLastSync = now - lastSyncRef.current;

      if (completed || timeSinceLastSync > DB_SYNC_INTERVAL) {
        return syncToDb();
      } else {
        scheduleSync();
        return Promise.resolve();
      }
    },
    [syncToDb, scheduleSync]
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      syncToDb();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        syncToDb();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncToDb();
    };
  }, [syncToDb]);

  return updateProgress;
}

export function useFlushPendingProgress() {
  const { user } = useUser();
  const updateMutation = useMutation(api.watchHistory.updateProgress);

  return useCallback(async () => {
    if (!user) return;

    const pending = getLocalStorage().filter((p) => p.needsSync);

    for (const progress of pending) {
      try {
        await updateMutation({
          clerkUserId: user.id,
          contentId: progress.contentId as Id<"content">,
          progress: progress.progress,
          completed: progress.completed,
          positionSeconds: progress.positionSeconds,
          durationSeconds: progress.durationSeconds,
          seasonNumber: progress.seasonNumber,
          episodeNumber: progress.episodeNumber
        });

        progress.needsSync = false;
        saveLocalProgress(progress);
      } catch {}
    }
  }, [user, updateMutation]);
}

export function useClearLocalProgress() {
  return useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {}
  }, []);
}
