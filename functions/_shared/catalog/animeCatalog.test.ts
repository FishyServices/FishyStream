import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAnimeCatalog } from "./animeCatalog";

afterEach(() => vi.restoreAllMocks());

describe("Cloudflare Anime catalog", () => {
  it("uses AniList taxonomy and enriches playable items with TMDB", async () => {
    const requests: string[] = [];
    const bodies: string[] = [];
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      requests.push(input);
      if (init?.body) bodies.push(String(init.body));
      if (input === "https://graphql.anilist.co") {
        return new Response(
          JSON.stringify({
            data: {
              Page: {
                pageInfo: { lastPage: 4, total: 2 },
                media: [
                  {
                    id: 101,
                    format: "TV",
                    title: { english: "Anime Series" },
                    startDate: { year: 2024 },
                    averageScore: 87,
                    popularity: 900,
                    genres: ["Action"]
                  },
                  {
                    id: 102,
                    format: "MOVIE",
                    title: { english: "Anime Movie" },
                    startDate: { year: 2023 },
                    averageScore: 82,
                    popularity: 400,
                    genres: ["Action"]
                  }
                ]
              }
            }
          }),
          { status: 200 }
        );
      }
      const isTv = input.includes("/search/tv?");
      return new Response(
        JSON.stringify({
          results: [
            {
              id: isTv ? 2 : 1,
              poster_path: "/poster.jpg"
            }
          ]
        }),
        { status: 200 }
      );
    });

    const result = await fetchAnimeCatalog(
      "https://fishystream.example/api/anime?media=all&genre=isekai&sort=popular&page=2",
      "secret-key",
      fetcher
    );

    expect(requests).toHaveLength(3);
    expect(requests[0]).toBe("https://graphql.anilist.co");
    expect(JSON.parse(bodies[0] ?? "{}").variables).toMatchObject({ tag: "Isekai" });
    expect(result.page).toBe(2);
    expect(result.items.map((item) => `${item.type}:${item.tmdbId}`)).toEqual(["tv:2", "movie:1"]);
  });
});
