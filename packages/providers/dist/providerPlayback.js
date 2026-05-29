import { getGroupedProviders, getProviderByKey } from "./providerCatalog";
import { getCanonicalSeasonCount, getCanonicalSeasonEpisodeCount } from "./tvSeasonMappings";
export function groupSourcesByProviderCategory(sources) {
    const sourceByKey = new Map(sources.map((source) => [source.key, source]));
    return getGroupedProviders(sources
        .map((source) => getProviderByKey(source.key))
        .filter((provider) => !!provider))
        .map((group) => ({
        key: group.key,
        label: group.label,
        sources: group.providers
            .map((provider) => sourceByKey.get(provider.key))
            .filter((source) => !!source)
    }))
        .filter((group) => group.sources.length > 0);
}
export function pickPreferredSource(sources, options) {
    const { initialSource, defaultProvider } = options;
    if (initialSource) {
        const source = sources.find((entry) => entry.name.toLowerCase() === initialSource.toLowerCase());
        if (source)
            return source;
    }
    if (defaultProvider && defaultProvider !== "auto") {
        const source = sources.find((entry) => entry.key === defaultProvider);
        if (source)
            return source;
    }
    return sources[0];
}
export function isAnimeProviderContent(content) {
    if (content.type !== "tv")
        return false;
    const genres = new Set((content.genre ?? []).map((genre) => genre.toLowerCase()));
    return genres.has("animation") && content.originalLanguage?.toLowerCase() === "ja";
}
export function shouldWaitForAnimeSeasonMetadata(args) {
    const { contentType, isAnime, seasonNumber, currentSeasonData } = args;
    if (!isAnime || contentType !== "tv")
        return false;
    if (seasonNumber <= 1)
        return false;
    if (currentSeasonData === undefined)
        return true;
    return currentSeasonData?.seasonNumber !== seasonNumber;
}
export function hasAnimeEpisodeMappingMetadata(currentSeasonData) {
    if (!currentSeasonData?.episodeCount)
        return false;
    return (currentSeasonData.anilistEpisodeMappings?.length ?? 0) >= currentSeasonData.episodeCount;
}
export function getSeasonYear(airDate) {
    const year = Number((airDate ?? "").split("-")[0]);
    return Number.isFinite(year) && year > 1900 ? year : undefined;
}
export function getNextEpisodeAddress({ tmdbId, currentSeason, currentEpisode, fallbackSeasonCount, currentSeasonEpisodeCount }) {
    const totalSeasons = getCanonicalSeasonCount(tmdbId, fallbackSeasonCount);
    const canonicalEpisodeCount = getCanonicalSeasonEpisodeCount(tmdbId, currentSeason) ?? 0;
    const maxEpisodes = Math.max(currentSeasonEpisodeCount ?? 0, canonicalEpisodeCount) || 999;
    let season = currentSeason;
    let episode = currentEpisode + 1;
    if (currentEpisode >= maxEpisodes) {
        season = currentSeason + 1;
        episode = 1;
    }
    if (season > totalSeasons)
        return null;
    return { season, episode };
}
export function hasNextEpisode(args) {
    return getNextEpisodeAddress(args) !== null;
}
