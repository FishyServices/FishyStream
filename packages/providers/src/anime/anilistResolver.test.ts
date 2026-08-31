import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAniListId } from "./anilistResolver.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockAniList(responses: Array<{ id: number; title: { english?: string } }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              Page: {
                media: responses
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    )
  );
}

describe("AniList resolver", () => {
  it("does not use an unrelated year candidate when the title is missing", async () => {
    mockAniList([{ id: 127230, title: { english: "Chainsaw Man" } }]);

    await expect(
      resolveAniListId({
        title: "The Legend of Vox Machina",
        season: 1,
        year: 2022
      })
    ).resolves.toBeNull();
  });

  it("accepts a matching animated title without a country restriction", async () => {
    mockAniList([{ id: 999999, title: { english: "The Legend of Vox Machina" } }]);

    await expect(
      resolveAniListId({
        title: "The Legend of Vox Machina",
        season: 1,
        year: 2022
      })
    ).resolves.toBe("999999");
  });
});
