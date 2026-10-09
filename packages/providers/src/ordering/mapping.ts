import { getTvOrderingOverride, type TmdbIdInput } from "./overrides.js";

export interface EpisodeAddress {
  season: number;
  episode: number;
}

function usesCanonicalOrder(providerName: string, formats: Partial<Record<string, string>>) {
  return (formats[providerName] ?? "canonical") === "canonical";
}

export function mapCanonicalToProviderOrder(
  tmdbId: TmdbIdInput,
  providerName: string,
  address: EpisodeAddress
): EpisodeAddress {
  const override = getTvOrderingOverride(tmdbId);
  if (!override || usesCanonicalOrder(providerName, override.providerFormats)) return address;

  const season = override.canonicalSeasons.find((entry) => entry.seasonNumber === address.season);
  if (!season) return address;
  return {
    season: season.sourceSeason,
    episode: season.sourceEpisodeStart + address.episode - 1
  };
}

export function mapProviderToCanonicalOrder(
  tmdbId: TmdbIdInput,
  providerName: string,
  address: EpisodeAddress
): EpisodeAddress {
  const override = getTvOrderingOverride(tmdbId);
  if (!override || usesCanonicalOrder(providerName, override.providerFormats)) return address;

  const season = override.canonicalSeasons.find(
    (entry) =>
      entry.sourceSeason === address.season &&
      address.episode >= entry.sourceEpisodeStart &&
      address.episode < entry.sourceEpisodeStart + entry.episodeCount
  );
  if (!season) return address;
  return {
    season: season.seasonNumber,
    episode: address.episode - season.sourceEpisodeStart + 1
  };
}
