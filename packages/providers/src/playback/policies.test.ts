import { describe, expect, it } from "vitest";
import {
  getNextEpisodeAddress,
  getSeasonYear,
  hasAnimeEpisodeMappingMetadata,
  shouldWaitForAnimeSeasonMetadata
} from "./episodes.js";
import { normalizePlaybackProgressSample, shouldStorePlaybackProgressSample } from "./progress.js";

describe("progress policy", () => {
  it("normalizes progress samples to valid ranges", () => {
    const sample = normalizePlaybackProgressSample({
      event: "timeupdate",
      currentTime: 120,
      duration: 100,
      progress: 150
    });
    expect(sample.currentTime).toBe(100);
    expect(sample.progress).toBe(100);
  });

  it("throttles tiny timeupdate samples", () => {
    const previous = normalizePlaybackProgressSample({
      event: "timeupdate",
      currentTime: 60,
      duration: 120,
      progress: 50
    });
    const next = {
      ...previous,
      currentTime: 61,
      progress: 50.5,
      sampledAt: previous.sampledAt + 1
    };
    expect(shouldStorePlaybackProgressSample(previous, next)).toBe(false);
    expect(shouldStorePlaybackProgressSample(previous, { ...next, event: "pause" })).toBe(true);
  });
});

describe("episode policy", () => {
  it("moves to the next season after the last episode", () => {
    expect(
      getNextEpisodeAddress({
        currentSeason: 1,
        currentEpisode: 10,
        fallbackSeasonCount: 2,
        currentSeasonEpisodeCount: 10
      })
    ).toEqual({ season: 2, episode: 1 });
  });

  it("returns null after the final episode of the final season", () => {
    expect(
      getNextEpisodeAddress({
        currentSeason: 2,
        currentEpisode: 10,
        fallbackSeasonCount: 2,
        currentSeasonEpisodeCount: 10
      })
    ).toBeNull();
  });

  it("waits when anime season metadata belongs to a different season", () => {
    expect(
      shouldWaitForAnimeSeasonMetadata({
        contentType: "tv",
        isAnime: true,
        seasonNumber: 2,
        currentSeasonData: { seasonNumber: 1 }
      })
    ).toBe(true);
  });

  it("detects complete anime mapping metadata", () => {
    expect(
      hasAnimeEpisodeMappingMetadata({ episodeCount: 12, anilistEpisodeMappingCount: 12 })
    ).toBe(true);
    expect(
      hasAnimeEpisodeMappingMetadata({ episodeCount: 12, anilistEpisodeMappingCount: 3 })
    ).toBe(false);
  });

  it("extracts valid season years", () => {
    expect(getSeasonYear("2021-04-03")).toBe(2021);
    expect(getSeasonYear("0000-01-01")).toBeUndefined();
    expect(getSeasonYear()).toBeUndefined();
  });
});
