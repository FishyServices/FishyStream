import { describe, expect, it } from "vitest";
import { createIMDbClient } from "./imdb/client.js";
import { createTMDBClient } from "./tmdb/client.js";

describe("metadata clients", () => {
  it("uses the same title, rating, and episode API for TMDB", async () => {
    const tmdb = createTMDBClient(async (path) => {
      if (path === "/tv/1399") {
        return { name: "Game of Thrones", vote_average: 9.2, vote_count: 100 };
      }
      return {
        episodes: [{ id: 63056, episode_number: 1, name: "Winter Is Coming", vote_average: 8.5 }]
      };
    });
    const reference = { id: "1399", type: "tv" as const };

    await expect(tmdb.getTitle(reference)).resolves.toMatchObject({
      id: "1399",
      type: "tv",
      title: "Game of Thrones",
      rating: { value: 9.2, voteCount: 100 }
    });
    await expect(tmdb.getTitleRating(reference)).resolves.toEqual({ value: 9.2, voteCount: 100 });
    await expect(tmdb.getEpisodePage({ ...reference, seasonNumber: 1 })).resolves.toMatchObject({
      episodes: [
        {
          id: "63056",
          type: "tv",
          title: "Winter Is Coming",
          seasonNumber: 1,
          episodeNumber: 1
        }
      ]
    });
  });

  it("uses the same title, rating, and episode API for IMDb", async () => {
    const imdb = createIMDbClient(async (query) => {
      if (query.includes("episodes(first")) {
        return {
          data: {
            title: {
              episodes: {
                episodes: {
                  edges: [
                    {
                      node: {
                        id: "tt1480055",
                        titleText: { text: "Pilot" },
                        ratingsSummary: { aggregateRating: 8.9, voteCount: 1000 }
                      }
                    }
                  ],
                  pageInfo: { hasNextPage: false }
                }
              }
            }
          }
        };
      }
      return {
        data: {
          title: {
            id: "tt0944947",
            titleText: { text: "Game of Thrones" },
            ratingsSummary: { aggregateRating: 9.2, voteCount: 2000 }
          }
        }
      };
    });
    const reference = { id: "tt0944947" as const, type: "tv" as const };

    await expect(imdb.getTitle(reference)).resolves.toMatchObject({
      id: "tt0944947",
      type: "tv",
      title: "Game of Thrones"
    });
    await expect(imdb.getTitleRating(reference)).resolves.toEqual({ value: 9.2, voteCount: 2000 });
    await expect(imdb.getEpisodePage({ ...reference, seasonNumber: 1 })).resolves.toMatchObject({
      episodes: [{ id: "tt1480055", type: "tv", title: "Pilot" }]
    });
  });
});
