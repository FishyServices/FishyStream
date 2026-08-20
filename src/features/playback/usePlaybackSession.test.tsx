import { describe, expect, it } from "vitest";
import { safeSourceUrl } from "./model/providerDiagnostics";
import {
  clampProgress,
  getEffectiveAnimeDub,
  isMatchingEpisodeProgress,
  pickResumePositionSeconds,
  setAnimeDubSearchParam
} from "./model/playbackState";
import type { ContentPlayback } from "@content/contentMetadata";
import type { ProgressState } from "@/features/library/useWatchProgress";

describe("usePlaybackSession support utilities", () => {
  it("redacts query strings from diagnostic source URLs", () => {
    expect(safeSourceUrl("https://provider.example/embed/1?token=secret")).toBe(
      "https://provider.example/embed/1"
    );
  });

  it("uses the saved dub preference when the URL has no override", () => {
    expect(getEffectiveAnimeDub(new URLSearchParams(), true)).toBe(true);
    expect(getEffectiveAnimeDub(new URLSearchParams("dub=false"), true)).toBe(false);
    expect(getEffectiveAnimeDub(new URLSearchParams("dub=true"), false)).toBe(true);
  });

  it("keeps an explicit sub choice when dub is the saved default", () => {
    const params = new URLSearchParams();
    setAnimeDubSearchParam(params, false, true);
    expect(params.get("dub")).toBe("false");

    setAnimeDubSearchParam(params, true, true);
    expect(params.get("dub")).toBe("true");
  });

  it("keeps resume position scoped to the current episode", () => {
    const content = {
      _id: "tmdb:tv:1",
      title: "Example",
      type: "tv",
      genre: [],
      year: 2026,
      posterUrl: ""
    } satisfies ContentPlayback;
    const watchState = {
      progress: 42,
      positionSeconds: 42,
      durationSeconds: 120,
      completed: false,
      seasonNumber: 2,
      episodeNumber: 3,
      clientUpdatedAt: 1
    } satisfies ProgressState;

    expect(isMatchingEpisodeProgress(content, watchState, 2, 3)).toBe(true);
    expect(isMatchingEpisodeProgress(content, watchState, 2, 4)).toBe(false);
    expect(pickResumePositionSeconds(content, watchState, 60, 2, 3)).toBe(60);
    expect(pickResumePositionSeconds(content, watchState, 60, 2, 4)).toBe(0);
  });

  it("clamps invalid progress to the playable range", () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(120)).toBe(100);
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});
