import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBookmarkIds,
  getBookmarkSnapshots,
  getWatchProgressStore,
  setBookmarkIds,
  setBookmarkSnapshots,
  setWatchProgressStore
} from "./viewerStateStorage";
import { readPlayerVolumeBoost, savePlayerVolumeBoost } from "./playerPreferencesStorage";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  });
});

describe("viewer state storage", () => {
  it("round-trips guest bookmarks", () => {
    const id = "tmdb:movie:1";
    setBookmarkIds([id]);
    setBookmarkSnapshots({
      [id]: { title: "Example", type: "movie", posterUrl: "poster", tmdbId: "1" }
    });

    expect(getBookmarkIds()).toEqual([id]);
    expect(getBookmarkSnapshots()[id]).toMatchObject({ title: "Example", tmdbId: "1" });
  });

  it("ignores malformed bookmark data", () => {
    values.set("fishystream:library:guest-bookmark-ids", "not json");
    values.set("fishystream:library:guest-bookmark-snapshots", "[]");

    expect(getBookmarkIds()).toEqual([]);
    expect(getBookmarkSnapshots()).toEqual({});
  });

  it("accepts only the current watch progress shape", () => {
    values.set("fishystream:library:watch-progress", JSON.stringify({ version: 2, entries: [] }));
    expect(getWatchProgressStore()).toBeNull();

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

describe("player volume boost", () => {
  it("uses 1 when unset and clamps saved values to 1–3", () => {
    expect(readPlayerVolumeBoost()).toBe(1);
    savePlayerVolumeBoost(4);
    expect(readPlayerVolumeBoost()).toBe(3);
    savePlayerVolumeBoost(0.5);
    expect(readPlayerVolumeBoost()).toBe(1);
  });

  it("uses the default for invalid stored values", () => {
    values.set("fishystream:player:volume-boost", "invalid");
    expect(readPlayerVolumeBoost()).toBe(1);
  });
});
