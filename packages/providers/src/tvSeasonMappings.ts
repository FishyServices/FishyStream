export interface EpisodeAddress {
  season: number;
  episode: number;
}

export interface CanonicalSeasonDefinition {
  seasonNumber: number;
  episodeCount: number;
  sourceSeason: number;
  sourceEpisodeStart: number;
}

export interface TvOrderingOverride {
  tmdbId: string;
  canonicalSeasonCount: number;
  canonicalTotalEpisodes: number;
  episodeGroupId?: string;
  canonicalSeasons: CanonicalSeasonDefinition[];
  providerFormats: Partial<Record<string, "canonical" | "tmdb">>;
  videoUrlOverrides?: Record<string, string>;
}

const MONEY_HEIST_TMDB_ID = "71446";
const GALACTIC_HEROES_TMDB_ID = "74018";

const MONEY_HEIST_OVERRIDE: TvOrderingOverride = {
  tmdbId: MONEY_HEIST_TMDB_ID,
  canonicalSeasonCount: 5,
  canonicalTotalEpisodes: 48,
  episodeGroupId: "5eb730dfca7ec6001f7beb51",
  canonicalSeasons: [
    { seasonNumber: 1, episodeCount: 13, sourceSeason: 1, sourceEpisodeStart: 1 },
    { seasonNumber: 2, episodeCount: 9, sourceSeason: 1, sourceEpisodeStart: 14 },
    { seasonNumber: 3, episodeCount: 8, sourceSeason: 2, sourceEpisodeStart: 1 },
    { seasonNumber: 4, episodeCount: 8, sourceSeason: 2, sourceEpisodeStart: 9 },
    { seasonNumber: 5, episodeCount: 10, sourceSeason: 3, sourceEpisodeStart: 1 }
  ],
  providerFormats: {
    VidKing: "canonical",
    VidFast: "canonical",
    VidEasy: "canonical"
  }
};

const GALACTIC_HEROES_OVERRIDE: TvOrderingOverride = {
  tmdbId: GALACTIC_HEROES_TMDB_ID,
  canonicalSeasonCount: 4,
  canonicalTotalEpisodes: 48,
  canonicalSeasons: [{ seasonNumber: 2, episodeCount: 12, sourceSeason: 2, sourceEpisodeStart: 1 }],
  providerFormats: {},
  videoUrlOverrides: {
    "season=2&episode=1": "https://ok.ru/videoembed/4084616465042",
    "season=2&episode=2": "https://ok.ru/videoembed/4084614236818",
    "season=2&episode=3": "https://ok.ru/videoembed/4084611877522",
    "season=2&episode=4": "https://ok.ru/videoembed/4084587825810",
    "season=2&episode=5": "https://ok.ru/videoembed/4084591954578",
    "season=2&episode=6": "https://ok.ru/videoembed/4084597394066",
    "season=2&episode=7": "https://ok.ru/videoembed/4084590316178",
    "season=2&episode=8": "https://ok.ru/videoembed/4084590906002",
    "season=2&episode=9": "https://ok.ru/videoembed/4084587563666",
    "season=2&episode=10": "https://ok.ru/videoembed/4084590250642",
    "season=2&episode=11": "https://ok.ru/videoembed/4084565543570",
    "season=2&episode=12": "https://ok.ru/videoembed/4084561349266",
    "season=3&episode=1": "https://ok.ru/videoembed/4084630620818",
    "season=3&episode=2": "https://ok.ru/videoembed/4084628982418",
    "season=3&episode=3": "https://ok.ru/videoembed/4084627147410",
    "season=3&episode=4": "https://ok.ru/videoembed/4084626754194",
    "season=3&episode=5": "https://ok.ru/videoembed/4084625836690",
    "season=3&episode=6": "https://ok.ru/videoembed/4084625509010",
    "season=3&episode=7": "https://ok.ru/videoembed/4084617644690",
    "season=3&episode=8": "https://ok.ru/videoembed/4084613778066",
    "season=3&episode=9": "https://ok.ru/videoembed/4084614498962",
    "season=3&episode=10": "https://ok.ru/videoembed/4354216430226",
    "season=3&episode=11": "https://ok.ru/videoembed/4325120215698",
    "season=3&episode=12": "https://ok.ru/videoembed/4325122640530"
  }
};

const OVERRIDES: Record<string, TvOrderingOverride> = {
  [MONEY_HEIST_TMDB_ID]: MONEY_HEIST_OVERRIDE,
  [GALACTIC_HEROES_TMDB_ID]: GALACTIC_HEROES_OVERRIDE
};

function normalizeTmdbId(tmdbId?: string | number | null): string | undefined {
  if (tmdbId == null) return undefined;
  const value = String(tmdbId).trim();
  return value || undefined;
}

export function getTvOrderingOverride(tmdbId?: string | number | null): TvOrderingOverride | null {
  const key = normalizeTmdbId(tmdbId);
  return key ? (OVERRIDES[key] ?? null) : null;
}

export function getCanonicalSeasonCount(
  tmdbId?: string | number | null,
  fallbackSeasonCount?: number | null
): number {
  const override = getTvOrderingOverride(tmdbId);
  if (override) return override.canonicalSeasonCount;
  return Math.max(1, fallbackSeasonCount ?? 1);
}

export function getCanonicalTotalEpisodes(
  tmdbId?: string | number | null,
  fallbackTotalEpisodes?: number | null
): number | undefined {
  const override = getTvOrderingOverride(tmdbId);
  if (override) return override.canonicalTotalEpisodes;
  return fallbackTotalEpisodes ?? undefined;
}

export function getCanonicalSeasonEpisodeCount(
  tmdbId?: string | number | null,
  seasonNumber?: number | null
): number | undefined {
  const override = getTvOrderingOverride(tmdbId);
  if (!override || seasonNumber == null) return undefined;
  return override.canonicalSeasons.find((season) => season.seasonNumber === seasonNumber)
    ?.episodeCount;
}

export function mapCanonicalToProviderOrder(
  tmdbId: string | number | null | undefined,
  providerName: string,
  address: EpisodeAddress
): EpisodeAddress {
  const override = getTvOrderingOverride(tmdbId);
  if (!override) return address;

  const format = override.providerFormats[providerName] ?? "canonical";
  if (format === "canonical") return address;

  const seasonDef = override.canonicalSeasons.find(
    (season) => season.seasonNumber === address.season
  );
  if (!seasonDef) return address;

  return {
    season: seasonDef.sourceSeason,
    episode: seasonDef.sourceEpisodeStart + address.episode - 1
  };
}

export function mapProviderToCanonicalOrder(
  tmdbId: string | number | null | undefined,
  providerName: string,
  address: EpisodeAddress
): EpisodeAddress {
  const override = getTvOrderingOverride(tmdbId);
  if (!override) return address;

  const format = override.providerFormats[providerName] ?? "canonical";
  if (format === "canonical") return address;

  const seasonDef = override.canonicalSeasons.find((season) => {
    if (season.sourceSeason !== address.season) return false;
    const episodeEnd = season.sourceEpisodeStart + season.episodeCount - 1;
    return address.episode >= season.sourceEpisodeStart && address.episode <= episodeEnd;
  });

  if (!seasonDef) return address;

  return {
    season: seasonDef.seasonNumber,
    episode: address.episode - seasonDef.sourceEpisodeStart + 1
  };
}
