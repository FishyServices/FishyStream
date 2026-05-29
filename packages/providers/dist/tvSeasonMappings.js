const MONEY_HEIST_TMDB_ID = "71446";
const MONEY_HEIST_OVERRIDE = {
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
const OVERRIDES = {
    [MONEY_HEIST_TMDB_ID]: MONEY_HEIST_OVERRIDE
};
function normalizeTmdbId(tmdbId) {
    if (tmdbId == null)
        return undefined;
    const value = String(tmdbId).trim();
    return value || undefined;
}
export function getTvOrderingOverride(tmdbId) {
    const key = normalizeTmdbId(tmdbId);
    return key ? (OVERRIDES[key] ?? null) : null;
}
export function getCanonicalSeasonCount(tmdbId, fallbackSeasonCount) {
    const override = getTvOrderingOverride(tmdbId);
    if (override)
        return override.canonicalSeasonCount;
    return Math.max(1, fallbackSeasonCount ?? 1);
}
export function getCanonicalTotalEpisodes(tmdbId, fallbackTotalEpisodes) {
    const override = getTvOrderingOverride(tmdbId);
    if (override)
        return override.canonicalTotalEpisodes;
    return fallbackTotalEpisodes ?? undefined;
}
export function getCanonicalSeasonEpisodeCount(tmdbId, seasonNumber) {
    const override = getTvOrderingOverride(tmdbId);
    if (!override || seasonNumber == null)
        return undefined;
    return override.canonicalSeasons.find((season) => season.seasonNumber === seasonNumber)
        ?.episodeCount;
}
export function mapCanonicalToProviderOrder(tmdbId, providerName, address) {
    const override = getTvOrderingOverride(tmdbId);
    if (!override)
        return address;
    const format = override.providerFormats[providerName] ?? "canonical";
    if (format === "canonical")
        return address;
    const seasonDef = override.canonicalSeasons.find((season) => season.seasonNumber === address.season);
    if (!seasonDef)
        return address;
    return {
        season: seasonDef.sourceSeason,
        episode: seasonDef.sourceEpisodeStart + address.episode - 1
    };
}
export function mapProviderToCanonicalOrder(tmdbId, providerName, address) {
    const override = getTvOrderingOverride(tmdbId);
    if (!override)
        return address;
    const format = override.providerFormats[providerName] ?? "canonical";
    if (format === "canonical")
        return address;
    const seasonDef = override.canonicalSeasons.find((season) => {
        if (season.sourceSeason !== address.season)
            return false;
        const episodeEnd = season.sourceEpisodeStart + season.episodeCount - 1;
        return address.episode >= season.sourceEpisodeStart && address.episode <= episodeEnd;
    });
    if (!seasonDef)
        return address;
    return {
        season: seasonDef.seasonNumber,
        episode: address.episode - seasonDef.sourceEpisodeStart + 1
    };
}
