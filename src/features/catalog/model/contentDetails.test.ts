import { describe, expect, it } from "vitest";
import { contentDetailFromTmdb } from "./contentDetails";

describe("contentDetailFromTmdb", () => {
  it("normalizes provider detail into shared content detail", () => {
    const detail = contentDetailFromTmdb({
      tmdbId: "42",
      type: "movie",
      title: "Example",
      description: "A test title",
      year: 2026,
      rating: "PG-13",
      posterUrl: "/poster.jpg",
      backdropUrl: "/backdrop.jpg",
      genre: ["Drama"],
      trending: true,
      isNew: false
    });

    expect(detail).toMatchObject({
      _id: "tmdb:movie:42",
      title: "Example",
      type: "movie",
      rating: "PG-13",
      new: false
    });
  });
});
