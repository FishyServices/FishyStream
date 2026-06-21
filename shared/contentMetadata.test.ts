import { describe, expect, it } from "vitest";
import {
  fromContentPlaybackWire,
  makeContentId,
  parseContentId,
  toContentPlaybackWire,
  toImageWire,
  fromImageWire
} from "./contentMetadata";

describe("contentMetadata", () => {
  it("round-trips content ids", () => {
    const id = makeContentId("movie", 11);

    expect(id).toBe("tmdb:movie:11");
    expect(parseContentId(id)).toEqual({ type: "movie", tmdbId: "11" });
  });

  it("round-trips compact playback wire data", () => {
    const wire = toContentPlaybackWire({
      contentId: "tmdb:tv:22",
      title: "Example",
      type: "tv",
      genre: ["Drama"],
      year: 2024,
      tmdbId: "22",
      imdbId: "tt22",
      seasons: 2
    });

    expect(fromContentPlaybackWire(wire)).toMatchObject({
      _id: "tmdb:tv:22",
      title: "Example",
      type: "tv",
      seasons: 2
    });
  });

  it("compacts TMDB image URLs", () => {
    const url = "https://image.tmdb.org/t/p/w500/poster.jpg";

    expect(fromImageWire(toImageWire(url))).toBe(url);
  });
});
