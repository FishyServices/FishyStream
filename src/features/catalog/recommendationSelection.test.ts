import { describe, expect, it } from "vitest";
import { selectFreshRecommendations } from "./recommendationSelection";

describe("selectFreshRecommendations", () => {
  it("moves to the next page window on each reload", () => {
    const first = selectFreshRecommendations(["a", "b", "c"], 1, [], (item) => item);
    const second = selectFreshRecommendations(["a", "b", "c"], 1, first.recentKeys, (item) => item);
    const third = selectFreshRecommendations(["a", "b", "c"], 1, second.recentKeys, (item) => item);

    expect(first.items).toEqual(["a"]);
    expect(second.items).toEqual(["b"]);
    expect(third.items).toEqual(["c"]);
  });

  it("replaces the whole page from the rotated pool", () => {
    const result = selectFreshRecommendations(
      ["a", "b", "c", "d"],
      3,
      ["a", "b", "c"],
      (item) => item
    );

    expect(result.items).toEqual(["d", "a", "b"]);
  });

  it("starts at the beginning only after the page window reaches the end", () => {
    const result = selectFreshRecommendations(
      ["a", "b", "c", "d"],
      3,
      ["b", "c", "d"],
      (item) => item
    );

    expect(result.items).toEqual(["a", "b", "c"]);
  });
});
