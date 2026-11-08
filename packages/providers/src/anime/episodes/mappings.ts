import { getAniListMediaById, resolveAniListEpisodeAddress } from "../anilist/resolver.js";
import { normalizeTitle } from "../anilist/matching.js";
import type { AniListSeasonQuery } from "../anilist/types.js";

export interface AniListEpisodeMapping {
  episodeNumber: number;
  anilistId: string;
  anilistEpisodeNumber: number;
}

export interface EpisodeMappingRequest extends AniListSeasonQuery {
  anilistId?: string | null;
  episodeOffset?: number;
  episodes: ReadonlyArray<{ episodeNumber: number; name: string; runtime?: number }>;
}

export async function buildAniListEpisodeMappings(
  request: EpisodeMappingRequest
): Promise<AniListEpisodeMapping[] | undefined> {
  const { anilistId, episodeOffset = 0, episodes, ...seasonQuery } = request;
  if (!anilistId) return undefined;

  if (seasonQuery.season === 0) {
    const media = await getAniListMediaById(anilistId);
    const expectedCount = media?.episodes;
    const expectedRuntime = media?.duration;
    if (!media || !expectedCount || !expectedRuntime) {
      console.info(
        "[AniList matching] Cannot map Specials episodes without AniList count/runtime",
        {
          anilistId,
          episodeCount: expectedCount,
          duration: expectedRuntime
        }
      );
      return undefined;
    }

    const titleAliases = (media.synonyms ?? []).map(normalizeTitle).filter(Boolean);
    const candidates = episodes.flatMap((episode) => {
      const episodeTitle = normalizeTitle(episode.name);
      const titleMatch = titleAliases.some(
        (alias) =>
          episodeTitle.length >= 3 &&
          (alias === episodeTitle || alias.includes(episodeTitle) || episodeTitle.includes(alias))
      );
      const runtimeDifference =
        episode.runtime === undefined ? undefined : Math.abs(episode.runtime - expectedRuntime);
      const runtimeMatch =
        runtimeDifference !== undefined &&
        episode.runtime! >= expectedRuntime * 0.5 &&
        episode.runtime! <= expectedRuntime * 1.5;
      if (!titleMatch && !runtimeMatch) return [];
      return [
        {
          ...episode,
          titleMatch,
          runtimeDifference: runtimeDifference ?? Number.POSITIVE_INFINITY
        }
      ];
    });

    const selected = [...candidates]
      .sort(
        (a, b) =>
          Number(b.titleMatch) - Number(a.titleMatch) || a.runtimeDifference - b.runtimeDifference
      )
      .slice(0, expectedCount)
      .sort((a, b) => a.episodeNumber - b.episodeNumber);
    if (selected.length !== expectedCount) {
      console.info("[AniList matching] Specials TMDB episodes did not match AniList metadata", {
        anilistId,
        expectedCount,
        expectedRuntime,
        candidates: candidates.map(({ episodeNumber, name, runtime, titleMatch }) => ({
          episodeNumber,
          name,
          runtime,
          titleMatch
        }))
      });
      return undefined;
    }

    const mappings = selected.map((episode, index) => ({
      episodeNumber: episode.episodeNumber,
      anilistId,
      anilistEpisodeNumber: index + 1
    }));
    console.info("[AniList matching] Matched TMDB Specials to AniList episodes", {
      anilistId,
      episodeCount: expectedCount,
      runtime: expectedRuntime,
      selected: selected.map(({ episodeNumber, name, runtime, titleMatch }, index) => ({
        episodeNumber,
        name,
        runtime,
        titleMatch,
        anilistEpisodeNumber: index + 1
      }))
    });
    return mappings;
  }

  const resolved = await Promise.all(
    episodes.map(async ({ episodeNumber }): Promise<AniListEpisodeMapping | null> => {
      const address = await resolveAniListEpisodeAddress({
        ...seasonQuery,
        anilistId,
        episode: episodeNumber + episodeOffset
      });
      return address
        ? { episodeNumber, anilistId: address.anilistId, anilistEpisodeNumber: address.episode }
        : null;
    })
  );
  const mappings = resolved.filter((mapping): mapping is AniListEpisodeMapping => mapping !== null);
  return mappings.length > 0 ? mappings : undefined;
}
