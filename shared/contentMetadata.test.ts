import { describe, expect, it } from "vitest";
import { makeContentId, parseContentId } from "./contentMetadata";

describe("contentMetadata", () => {
  it("round-trips content ids", () => {
    const id = makeContentId("movie", 11);

    expect(id).toBe("tmdb:movie:11");
    expect(parseContentId(id)).toEqual({ type: "movie", tmdbId: "11" });
  });
});
