import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWatchProgressStore,
  getWatchlistIds,
  getWatchlistSnapshots,
  setWatchProgressStore,
  setWatchlistIds,
  setWatchlistSnapshots
} from "./localStorageStore";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear()
  });
});

describe("localStorageStore", () => {
  it("round-trips watchlist ids and snapshots", () => {
    setWatchlistIds(["tmdb:movie:1"]);
    setWatchlistSnapshots({
      "tmdb:movie:1": {
        title: "Example",
        type: "movie",
        posterUrl: "poster",
        tmdbId: "1"
      }
    });

    expect(getWatchlistIds()).toEqual(["tmdb:movie:1"]);
    expect(getWatchlistSnapshots()).toMatchObject({
      "tmdb:movie:1": { title: "Example", tmdbId: "1" }
    });
  });

  it("returns empty watchlist values for malformed data", () => {
    storage.set("watchlist_ids", '{"ids":[]}');
    storage.set("watchlist_snapshots_v1", "[]");

    expect(getWatchlistIds()).toEqual([]);
    expect(getWatchlistSnapshots()).toEqual({});
  });

  it("returns null for malformed progress data", () => {
    storage.set("watch_progress_v3", JSON.stringify({ version: 2, entries: [] }));

    expect(getWatchProgressStore()).toBeNull();
  });

  it("round-trips the versioned progress store", () => {
    const store = {
      version: 3 as const,
      entries: [
        {
          contentId: "tmdb:movie:1",
          progress: 25,
          positionSeconds: 30,
          durationSeconds: 120,
          completed: false,
          clientUpdatedAt: 1,
          dirty: true
        }
      ]
    };

    setWatchProgressStore(store);

    expect(getWatchProgressStore()).toEqual(store);
  });
});
