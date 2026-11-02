import { describe, expect, it } from "vitest";
import { HttpError } from "../../shared/http.js";
import { createAnimeScheduleClient } from "./client.js";

describe("AnimeSchedule client", () => {
  it("treats a search 404 as no anime match", async () => {
    const client = createAnimeScheduleClient(async () => {
      throw new HttpError("AnimeSchedule", 404, "Couldn't find anime with these parameters.");
    });

    await expect(client.searchAnime("A title with no anime match")).resolves.toEqual([]);
  });

  it("preserves the AnimeSchedule airing status for matched seasons", async () => {
    const client = createAnimeScheduleClient(async () => [
      {
        id: "oshi-no-ko-3rd-season",
        title: "【OSHI NO KO】3rd Season",
        route: "oshi-no-ko-3rd-season",
        status: "Finished",
        names: { english: "Oshi no Ko Season 3" }
      }
    ]);

    await expect(client.searchAnime("Oshi no Ko")).resolves.toMatchObject([
      { title: "【OSHI NO KO】3rd Season", status: "Finished" }
    ]);
  });
});
