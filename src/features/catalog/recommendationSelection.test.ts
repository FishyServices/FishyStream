import { describe, expect, it } from "vitest";
import { selectFreshRecommendations } from "./recommendationSelection";

describe("selectFreshRecommendations", () => {
  it("does not repeat an item until the candidate cycle is exhausted", () => {
    const first = selectFreshRecommendations(["a", "b", "c"], 1, [], (item) => item, 1);
    const second = selectFreshRecommendations(
      ["a", "b", "c"],
      1,
      first.recentKeys,
      (item) => item,
      2
    );
    const third = selectFreshRecommendations(
      ["a", "b", "c"],
      1,
      second.recentKeys,
      (item) => item,
      3
    );

    expect(new Set([first.items[0], second.items[0], third.items[0]]).size).toBe(3);
  });

  it("uses only unseen candidates while enough remain", () => {
    const result = selectFreshRecommendations(["a", "b", "c", "d"], 3, ["a"], (item) => item, 4);

    expect(result.items).toHaveLength(3);
    expect(result.items).not.toContain("a");
  });

  it("starts a new cycle when fewer than a page remain", () => {
    const result = selectFreshRecommendations(
      ["a", "b", "c", "d"],
      3,
      ["a", "b", "c"],
      (item) => item,
      5
    );

    expect(result.items).toHaveLength(3);
    expect(result.recentKeys).toEqual(result.items);
  });
});
