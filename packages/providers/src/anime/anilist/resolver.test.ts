import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAniListId } from "./resolver.js";
import { hasStrongTitleMatch } from "./matching.js";

afterEach(() => vi.unstubAllGlobals());

function mockAniList(
  media: Array<{
    id: number;
    format?: string;
    startDate?: { year?: number };
    title: { english?: string };
  }>
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { Page: { media } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
    )
  );
}

describe("AniList resolver", () => {
  it("ignores unrelated year candidates when the title is missing", async () => {
    mockAniList([{ id: 127230, title: { english: "Chainsaw Man" } }]);
    await expect(
      resolveAniListId({ title: "The Legend of Vox Machina", season: 1, year: 2022 })
    ).resolves.toBeNull();
  });

  it("accepts a matching title without a country restriction", async () => {
    mockAniList([{ id: 999999, title: { english: "The Legend of Vox Machina" } }]);
    await expect(
      resolveAniListId({ title: "The Legend of Vox Machina", season: 1, year: 2022 })
    ).resolves.toBe("999999");
  });

  it("matches a numeric sequel suffix to its season", async () => {
    mockAniList([{ id: 97765, title: { english: "Isekai Quartet 2" } }]);
    await expect(resolveAniListId({ title: "Isekai Quartet", season: 2 })).resolves.toBe("97765");
  });

  it("prefers Link Click over its similarly titled shorts", async () => {
    mockAniList([
      {
        id: 140175,
        format: "TV_SHORT",
        startDate: { year: 2021 },
        title: { english: "Shiguang Dailiren: Xiao Juchang" }
      },
      {
        id: 126403,
        format: "ONA",
        startDate: { year: 2021 },
        title: { english: "Shiguang Dailiren" }
      }
    ]);
    await expect(
      resolveAniListId({ title: "Shiguang Dailiren", season: 1, year: 2021 })
    ).resolves.toBe("126403");
  });

  it("does not treat a subtitle suffix as an exact main-series match", () => {
    expect(
      hasStrongTitleMatch(
        { id: 140175, title: { english: "Shiguang Dailiren: Xiao Juchang" } },
        "Shiguang Dailiren",
        1
      )
    ).toBe(false);
  });

  it("returns null without a title", async () => {
    await expect(resolveAniListId({ season: 1 })).resolves.toBeNull();
  });
});
