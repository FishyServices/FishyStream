import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWatchProgressStore,
  getWatchlistIds,
  getWatchlistSnapshots,
  setWatchProgressStore,
  setWatchlistIds,
  setWatchlistSnapshots,
  getCustomPlayerVolume,
  setCustomPlayerVolume,
  getCustomPlayerVolumeBoost,
  setCustomPlayerVolumeBoost
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

  describe("custom player volume settings", () => {
    it("returns default volume 1 when not set", () => {
      expect(getCustomPlayerVolume()).toBe(1);
    });

    it("round-trips custom player volume", () => {
      setCustomPlayerVolume(0.45);
      expect(getCustomPlayerVolume()).toBe(0.45);
    });

    it("clamps custom player volume to [0, 1]", () => {
      setCustomPlayerVolume(1.5);
      expect(getCustomPlayerVolume()).toBe(1);

      setCustomPlayerVolume(-0.2);
      expect(getCustomPlayerVolume()).toBe(0);
    });

    it("returns default volume 1 for invalid stored value", () => {
      storage.set("custom_player_volume", "invalid");
      expect(getCustomPlayerVolume()).toBe(1);

      storage.set("custom_player_volume", "5.0");
      expect(getCustomPlayerVolume()).toBe(1);
    });

    it("returns default volume boost 1.0 when not set", () => {
      expect(getCustomPlayerVolumeBoost()).toBe(1.0);
    });

    it("round-trips custom player volume boost", () => {
      setCustomPlayerVolumeBoost(2.5);
      expect(getCustomPlayerVolumeBoost()).toBe(2.5);
    });

    it("clamps custom player volume boost to [1, 3]", () => {
      setCustomPlayerVolumeBoost(4.0);
      expect(getCustomPlayerVolumeBoost()).toBe(3);

      setCustomPlayerVolumeBoost(0.5);
      expect(getCustomPlayerVolumeBoost()).toBe(1);
    });

    it("returns default volume boost 1.0 for invalid stored value", () => {
      storage.set("custom_player_volume_boost", "invalid");
      expect(getCustomPlayerVolumeBoost()).toBe(1.0);

      storage.set("custom_player_volume_boost", "0.5");
      expect(getCustomPlayerVolumeBoost()).toBe(1.0);
    });
  });
});
