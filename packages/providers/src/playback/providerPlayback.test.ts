import { describe, expect, it } from "vitest";
import {
  getNextEpisodeAddress,
  normalizePlaybackProgressSample,
  shouldWaitForAnimeSeasonMetadata,
  shouldStorePlaybackProgressSample
} from "./providerPlayback.js";

describe("providerPlayback", () => {
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
  });

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
});
