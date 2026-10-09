export interface CanonicalSeasonDefinition {
  seasonNumber: number;
  episodeCount: number;
  sourceSeason: number;
  sourceEpisodeStart: number;
}

export type ProviderOrderFormat = "canonical" | "tmdb";

export interface TvOrderingOverride {
  tmdbId: string;
  canonicalSeasonCount: number;
  canonicalTotalEpisodes: number;
  episodeGroupId?: string;
  canonicalSeasons: CanonicalSeasonDefinition[];
  providerFormats: Partial<Record<string, ProviderOrderFormat>>;
  directVideoIds?: Readonly<Record<number, readonly string[]>>;
}

const DIRECT_VIDEO_BASE_URL = "https://ok.ru/videoembed";

const MONEY_HEIST: TvOrderingOverride = {
  tmdbId: "71446",
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

const GALACTIC_HEROES: TvOrderingOverride = {
  tmdbId: "74018",
  canonicalSeasonCount: 4,
  canonicalTotalEpisodes: 48,
  canonicalSeasons: [{ seasonNumber: 2, episodeCount: 12, sourceSeason: 2, sourceEpisodeStart: 1 }],
  providerFormats: {},
  directVideoIds: {
    2: [
      "4084616465042",
      "4084614236818",
      "4084611877522",
      "4084587825810",
      "4084591954578",
      "4084597394066",
      "4084590316178",
      "4084590906002",
      "4084587563666",
      "4084590250642",
      "4084565543570",
      "4084561349266"
    ],
    3: [
      "4084630620818",
      "4084628982418",
      "4084627147410",
      "4084626754194",
      "4084625836690",
      "4084625509010",
      "4084617644690",
      "4084613778066",
      "4084614498962",
      "4354216430226",
      "4325120215698",
      "4325122640530"
    ]
  }
};

const OVERRIDES: ReadonlyMap<string, TvOrderingOverride> = new Map(
  [MONEY_HEIST, GALACTIC_HEROES].map((override) => [override.tmdbId, override])
);

export type TmdbIdInput = string | number | null | undefined;

export function getTvOrderingOverride(tmdbId: TmdbIdInput): TvOrderingOverride | null {
  if (tmdbId == null) return null;
  return OVERRIDES.get(String(tmdbId).trim()) ?? null;
}

export function getDirectVideoUrl(
  tmdbId: TmdbIdInput,
  season: number,
  episode: number
): string | undefined {
  const id = getTvOrderingOverride(tmdbId)?.directVideoIds?.[season]?.[episode - 1];
  return id ? `${DIRECT_VIDEO_BASE_URL}/${id}` : undefined;
}

export function getCanonicalSeasonCount(
  tmdbId: TmdbIdInput,
  fallbackSeasonCount?: number | null
): number {
  return (
    getTvOrderingOverride(tmdbId)?.canonicalSeasonCount ?? Math.max(1, fallbackSeasonCount ?? 1)
  );
}

export function getCanonicalTotalEpisodes(
  tmdbId: TmdbIdInput,
  fallbackTotalEpisodes?: number | null
): number | undefined {
  return (
    getTvOrderingOverride(tmdbId)?.canonicalTotalEpisodes ?? fallbackTotalEpisodes ?? undefined
  );
}

function findCanonicalSeason(
  tmdbId: TmdbIdInput,
  seasonNumber?: number | null
): CanonicalSeasonDefinition | undefined {
  if (seasonNumber == null) return undefined;
  return getTvOrderingOverride(tmdbId)?.canonicalSeasons.find(
    (season) => season.seasonNumber === seasonNumber
  );
}

export function getCanonicalSeasonEpisodeCount(
  tmdbId: TmdbIdInput,
  seasonNumber?: number | null
): number | undefined {
  return findCanonicalSeason(tmdbId, seasonNumber)?.episodeCount;
}

export function getCanonicalSeasonEpisodeStart(
  tmdbId: TmdbIdInput,
  seasonNumber?: number | null
): number | undefined {
  return findCanonicalSeason(tmdbId, seasonNumber)?.sourceEpisodeStart;
}
