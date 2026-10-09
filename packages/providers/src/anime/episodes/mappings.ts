import { resolveAniListEpisodeAddress } from "../anilist/resolver.js";
import type { AniListSeasonQuery } from "../anilist/types.js";

export interface AniListEpisodeMapping {
  episodeNumber: number;
  anilistId: string;
  anilistEpisodeNumber: number;
}

export interface EpisodeMappingRequest extends AniListSeasonQuery {
  anilistId?: string | null;
  episodeOffset?: number;
  episodes: ReadonlyArray<{ episodeNumber: number }>;
}

export async function buildAniListEpisodeMappings(
  request: EpisodeMappingRequest
): Promise<AniListEpisodeMapping[] | undefined> {
  const { anilistId, episodeOffset = 0, episodes, ...seasonQuery } = request;
  if (!anilistId) return undefined;

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
