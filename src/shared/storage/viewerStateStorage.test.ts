import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBookmarkIds,
  getBookmarkSnapshots,
  getCachedAnimeReleaseSchedules,
  getUncachedAnimeReleaseIds,
  getCachedTvRelease,
  getWatchProgressStore,
  setCachedAnimeReleaseSchedules,
  setCachedTvRelease,
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

  it("reuses anime release entries when the selected bookmark set grows", () => {
    const schedules = [
      {
        contentId: "tmdb:tv:42",
        title: "Example Season 3",
        matched: true,
        status: "Ongoing",
        sub: [{ episode: 1, date: "2026-11-10T18:00:00Z", platform: null, estimated: false }],
        dub: [],
        dubProgress: null,
        dubbedEpisodes: null,
        totalEpisodes: 12,
        dubConfidence: null,
        dubReason: null,
        dubVerifiedAt: null
      }
    ];
    const addedShow = {
      ...schedules[0]!,
      contentId: "tmdb:tv:43",
      title: "Another title"
    };
    setCachedAnimeReleaseSchedules(["tmdb:tv:42"], schedules, 1_000);

    expect(getCachedAnimeReleaseSchedules(["tmdb:tv:42", "tmdb:tv:43"], 2_000)).toEqual(schedules);
    expect(getUncachedAnimeReleaseIds(["tmdb:tv:42", "tmdb:tv:43"], 2_000)).toEqual(["tmdb:tv:43"]);
    setCachedAnimeReleaseSchedules(["tmdb:tv:43"], [addedShow], 3_000);
    expect(getCachedAnimeReleaseSchedules(["tmdb:tv:42", "tmdb:tv:43"], 4_000)).toEqual([
      ...schedules,
      addedShow
    ]);
    expect(getUncachedAnimeReleaseIds(["tmdb:tv:42"], 6 * 60 * 60 * 1000 + 1_001)).toEqual([
      "tmdb:tv:42"
    ]);
  });

  it("ignores an invalid cached anime release response", () => {
    values.set(
      "fishystream:library:release-cache",
      JSON.stringify({
        anime: { selectedIds: ["tmdb:tv:42"], cachedAt: 1, schedules: [{ title: "bad" }] }
      })
    );

    expect(getCachedAnimeReleaseSchedules(["tmdb:tv:42"], 2)).toEqual([]);
    expect(getUncachedAnimeReleaseIds(["tmdb:tv:42"], 2)).toEqual(["tmdb:tv:42"]);
  });

  it("refreshes cached anime schedules that do not include airing status", () => {
    values.set(
      "fishystream:library:release-cache",
      JSON.stringify({
        animeByContentId: {
          "tmdb:tv:42": {
            cachedAt: 1,
            schedules: [
              {
                contentId: "tmdb:tv:42",
                title: "Oshi no Ko Season 3",
                matched: true,
                sub: [],
                dub: [],
                dubProgress: null,
                dubbedEpisodes: null,
                totalEpisodes: null,
                dubConfidence: null,
                dubReason: null,
                dubVerifiedAt: null
              }
            ]
          }
        }
      })
    );

    expect(getUncachedAnimeReleaseIds(["tmdb:tv:42"], 2)).toEqual(["tmdb:tv:42"]);
  });

  it("caches TV premiere details and known absence of an upcoming episode", () => {
    const premiere = {
      name: "The First Signal",
      airDate: "2026-11-10",
      seasonNumber: 3,
      episodeNumber: 1
    };
    setCachedTvRelease("42", { episode: premiere, available: true }, 1_000);
    setCachedTvRelease("84", { episode: null, available: true }, 1_000);

    expect(getCachedTvRelease("42", 2_000)).toEqual({ episode: premiere, available: true });
    expect(getCachedTvRelease("84", 2_000)).toEqual({ episode: null, available: true });
    expect(getCachedTvRelease("42", 24 * 60 * 60 * 1000 + 1_001)).toBeNull();
  });

  it("keeps anime schedules and TV dates in one local storage entry", () => {
    const schedules = [
      {
        contentId: "tmdb:tv:42",
        title: "Example",
        matched: true,
        status: "Finished",
        sub: [],
        dub: [],
        dubProgress: null,
        dubbedEpisodes: null,
        totalEpisodes: null,
        dubConfidence: null,
        dubReason: null,
        dubVerifiedAt: null
      }
    ];
    setCachedAnimeReleaseSchedules(["tmdb:tv:42"], schedules, 1_000);
    setCachedTvRelease("42", { episode: null, available: true }, 1_001);

    expect(values.size).toBe(1);
    expect([...values.keys()]).toEqual(["fishystream:library:release-cache"]);
    expect(JSON.parse(values.get("fishystream:library:release-cache")!)).toMatchObject({
      animeByContentId: { "tmdb:tv:42": { schedules } },
      tv: { "42": { episode: null } }
    });
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
