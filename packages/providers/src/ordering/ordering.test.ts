import { describe, expect, it } from "vitest";
import {
  getCanonicalSeasonCount,
  getDirectVideoUrl,
  mapCanonicalToProviderOrder,
  mapProviderToCanonicalOrder
} from "./index.js";

describe("tv ordering", () => {
  it("uses canonical counts for overridden shows and fallbacks otherwise", () => {
    expect(getCanonicalSeasonCount("71446", 3)).toBe(5);
    expect(getCanonicalSeasonCount("1", 3)).toBe(3);
    expect(getCanonicalSeasonCount(undefined, undefined)).toBe(1);
  });

  it("builds direct video urls from stored ids", () => {
    expect(getDirectVideoUrl("74018", 2, 1)).toBe("https://ok.ru/videoembed/4084616465042");
    expect(getDirectVideoUrl("74018", 3, 12)).toBe("https://ok.ru/videoembed/4325122640530");
    expect(getDirectVideoUrl("74018", 4, 1)).toBeUndefined();
    expect(getDirectVideoUrl("1", 2, 1)).toBeUndefined();
  });

  it("leaves addresses untouched for canonical providers", () => {
    const address = { season: 2, episode: 3 };
    expect(mapCanonicalToProviderOrder("71446", "VidFast", address)).toEqual(address);
    expect(mapProviderToCanonicalOrder("71446", "VidFast", address)).toEqual(address);
  });
});
