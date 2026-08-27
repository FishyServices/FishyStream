import { describe, expect, it } from "vitest";
import { isBlockedContent } from "./contentPolicy";

describe("content policy", () => {
  it("blocks the reported title by TMDB and IMDb identifiers", () => {
    expect(isBlockedContent({ tmdbId: "969681", type: "movie" })).toBe(true);
    expect(isBlockedContent({ imdbId: "tt22084616" })).toBe(true);
  });

  it("does not block unrelated content", () => {
    expect(isBlockedContent({ tmdbId: "550", type: "movie", imdbId: "tt0137523" })).toBe(false);
  });
});
