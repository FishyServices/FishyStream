import { getGroupedProviders, getProviderByKey } from "./providerCatalog";
import { getCanonicalSeasonCount, getCanonicalSeasonEpisodeCount } from "./tvSeasonMappings";
export const WATCH_PROGRESS_SYNC_INTERVAL_MS = 20 * 60_000;
export const WATCH_PROGRESS_STATUS_POLL_MS = 30_000;
export const WATCH_PROGRESS_MIN_LOCAL_SAMPLE_MS = 15_000;
export const WATCH_PROGRESS_MIN_POSITION_DELTA_SECONDS = 30;
export const WATCH_PROGRESS_MIN_PERCENT_DELTA = 2;
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
    if (currentSeasonData?.anilistEpisodeMappings?.length)
        return true;
    if (!currentSeasonData?.episodeCount)
        return false;
    return ((currentSeasonData.anilistEpisodeMappingCount ??
        currentSeasonData.anilistEpisodeMappings?.length ??
        0) >= currentSeasonData.episodeCount);
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
export function normalizePlaybackProgressSample(sample) {
    const duration = Number.isFinite(sample.duration) ? Math.max(0, sample.duration) : 0;
    const currentTime = Number.isFinite(sample.currentTime)
        ? Math.max(0, Math.min(sample.currentTime, duration || sample.currentTime))
        : 0;
    const progress = Number.isFinite(sample.progress)
        ? Math.max(0, Math.min(100, sample.progress))
        : duration > 0
            ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
            : 0;
    return {
        ...sample,
        currentTime,
        duration,
        progress,
        sampledAt: Date.now()
    };
}
export function shouldStorePlaybackProgressSample(previous, next) {
    if (!previous)
        return next.currentTime >= 5 || next.progress >= 1 || next.event !== "timeupdate";
    if (next.event !== "timeupdate")
        return true;
    if (Math.abs(next.currentTime - previous.currentTime) >= WATCH_PROGRESS_MIN_POSITION_DELTA_SECONDS) {
        return true;
    }
    if (Math.abs(next.progress - previous.progress) >= WATCH_PROGRESS_MIN_PERCENT_DELTA)
        return true;
    return next.sampledAt - previous.sampledAt >= WATCH_PROGRESS_MIN_LOCAL_SAMPLE_MS;
}
