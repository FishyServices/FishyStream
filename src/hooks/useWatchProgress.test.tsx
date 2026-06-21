import { describe, expect, it } from "vitest";
import { toProgressPayload } from "./useWatchProgress";

describe("watch progress payload", () => {
  it("encodes optional progress metadata compactly", () => {
    const payload = toProgressPayload({
      contentId: "tmdb:tv:1",
      progressId: "progress-id",
      progress: 12.34,
      positionSeconds: 90,
      durationSeconds: 1800,
      completed: false,
      seasonNumber: 2,
      episodeNumber: 3,
      source: "Peachify",
      dub: true,
      clientUpdatedAt: 123,
      dirty: true
    });

    expect(payload).toEqual([
      "progress-id",
      "tmdb:tv:1",
      12.3,
      0,
      90,
      31,
      123,
      1800,
      2,
      3,
      "Peachify"
    ]);
  });
});
