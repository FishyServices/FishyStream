import { getProviderByOrigin } from "./providerCatalog";
function toFiniteNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
function parseMaybeJson(raw) {
    if (typeof raw !== "string")
        return raw;
    try {
        return JSON.parse(raw);
    }
    catch {
        return raw;
    }
}
function isRecord(value) {
    return !!value && typeof value === "object";
}
function isPlayerEventPayload(value) {
    if (!isRecord(value) || value.type !== "PLAYER_EVENT" || !isRecord(value.data))
        return false;
    return typeof value.data.event === "string";
}
function isRawMediaData(value) {
    if (!isRecord(value) || !isRecord(value.progress))
        return false;
    return (value.id !== undefined &&
        (value.type === "movie" || value.type === "tv" || value.type === "anime") &&
        toFiniteNumber(value.progress.watched) !== undefined &&
        toFiniteNumber(value.progress.duration) !== undefined);
}
function unwrapMediaData(value) {
    if (isRawMediaData(value))
        return value;
    if (!isRecord(value))
        return null;
    const firstValue = Object.values(value)[0];
    return isRawMediaData(firstValue) ? firstValue : null;
}
function isRawProgressPayload(value) {
    if (!isRecord(value))
        return false;
    return (value.id !== undefined &&
        (value.type === "movie" || value.type === "tv" || value.type === "anime") &&
        toFiniteNumber(value.progress) !== undefined &&
        toFiniteNumber(value.timestamp) !== undefined &&
        toFiniteNumber(value.duration) !== undefined);
}
function isMegaPlayTimePayload(value) {
    if (!isRecord(value))
        return false;
    return ((value.event === "time" || value.event === "complete" || value.event === "error") &&
        (toFiniteNumber(value.time) !== undefined ||
            toFiniteNumber(value.duration) !== undefined ||
            toFiniteNumber(value.percent) !== undefined));
}
function isMegaPlayWatchingLogPayload(value) {
    if (!isRecord(value) || value.type !== "watching-log")
        return false;
    return (toFiniteNumber(value.currentTime) !== undefined || toFiniteNumber(value.duration) !== undefined);
}
function normalizeMediaType(value) {
    return value === "movie" ? "movie" : "tv";
}
function normalizePlayerEventPayload(payload) {
    return {
        type: "PLAYER_EVENT",
        data: {
            ...payload.data,
            mediaType: normalizeMediaType(payload.data.mediaType),
            season: toFiniteNumber(payload.data.season),
            episode: toFiniteNumber(payload.data.episode)
        }
    };
}
function mediaDataToPlayerEvent(value) {
    const watched = toFiniteNumber(value.progress.watched) ?? 0;
    const duration = toFiniteNumber(value.progress.duration) ?? 0;
    const explicitProgress = toFiniteNumber(value.progress.percentage);
    return {
        type: "PLAYER_EVENT",
        data: {
            event: "timeupdate",
            currentTime: watched,
            duration,
            progress: explicitProgress ?? calculateProgress(watched, duration),
            id: String(value.id),
            mediaType: normalizeMediaType(value.mediaType ?? value.type),
            timestamp: Date.now()
        }
    };
}
function rawProgressToPlayerEvent(value) {
    const currentTime = toFiniteNumber(value.timestamp) ?? 0;
    const duration = toFiniteNumber(value.duration) ?? 0;
    return {
        type: "PLAYER_EVENT",
        data: {
            event: "timeupdate",
            currentTime,
            duration,
            progress: toFiniteNumber(value.progress) ?? calculateProgress(currentTime, duration),
            id: String(value.id),
            mediaType: normalizeMediaType(value.type),
            season: toFiniteNumber(value.season),
            episode: toFiniteNumber(value.episode),
            timestamp: Date.now()
        }
    };
}
function megaPlayTimeToPlayerEvent(value) {
    const currentTime = Math.max(0, toFiniteNumber(value.time) ?? 0);
    const duration = Math.max(0, toFiniteNumber(value.duration) ?? 0);
    const progress = toFiniteNumber(value.percent);
    return {
        type: "PLAYER_EVENT",
        data: {
            event: value.event === "complete" ? "ended" : "timeupdate",
            currentTime,
            duration,
            progress: progress ?? calculateProgress(currentTime, duration),
            mediaType: "tv",
            timestamp: Date.now()
        }
    };
}
function megaPlayWatchingLogToPlayerEvent(value) {
    const currentTime = Math.max(0, toFiniteNumber(value.currentTime) ?? 0);
    const duration = Math.max(0, toFiniteNumber(value.duration) ?? 0);
    return {
        type: "PLAYER_EVENT",
        data: {
            event: "timeupdate",
            currentTime,
            duration,
            progress: calculateProgress(currentTime, duration),
            mediaType: "tv",
            timestamp: Date.now()
        }
    };
}
export function isKnownPlayerOrigin(origin) {
    return !!getProviderByOrigin(origin)?.progress;
}
export function parsePlayerMessage(raw, origin) {
    const normalizedOrigin = origin || "";
    if (normalizedOrigin && !isKnownPlayerOrigin(normalizedOrigin))
        return null;
    const payload = parseMaybeJson(raw);
    if (payload === raw && typeof raw === "string")
        return null;
    if (isPlayerEventPayload(payload)) {
        return normalizePlayerEventPayload(payload);
    }
    if (isRecord(payload) && payload.type === "MEDIA_DATA") {
        const nested = parseMaybeJson(payload.data);
        const mediaData = unwrapMediaData(nested);
        return mediaData ? mediaDataToPlayerEvent(mediaData) : null;
    }
    const mediaData = unwrapMediaData(payload);
    if (mediaData)
        return mediaDataToPlayerEvent(mediaData);
    if (isRawProgressPayload(payload)) {
        return rawProgressToPlayerEvent(payload);
    }
    if (isMegaPlayTimePayload(payload)) {
        return megaPlayTimeToPlayerEvent(payload);
    }
    if (isMegaPlayWatchingLogPayload(payload)) {
        return megaPlayWatchingLogToPlayerEvent(payload);
    }
    return null;
}
export function calculateProgress(currentTime, duration) {
    if (!duration || duration <= 0)
        return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}
export function shouldApplyProviderResume(providerKey, contentType) {
    if (!providerKey)
        return false;
    if (providerKey === "vidking" && contentType === "tv")
        return false;
    if (providerKey === "vidnest" && contentType === "tv")
        return false;
    return true;
}
export function shouldForceProviderStartPosition(providerKey) {
    return providerKey === "vidfast";
}
export function applyProviderEmbedParams(url, providerKey, contentType) {
    if (contentType !== "tv")
        return;
    if (providerKey === "vidfast") {
        url.searchParams.set("nextButton", "false");
        url.searchParams.set("autoNext", "false");
        url.searchParams.set("hideServerControls", "true");
    }
    if (providerKey === "vidnest") {
        url.searchParams.set("prevepisode", "hide");
        url.searchParams.set("nextepisode", "hide");
    }
    if (providerKey === "vidcore") {
        url.searchParams.set("nextButton", "false");
    }
    if (providerKey === "mafiaembed") {
        url.searchParams.set("episodelist", "false");
        url.searchParams.set("nextbutton", "false");
        url.searchParams.set("autonext", "false");
    }
}
export function createProviderEmbedUrl({ sourceUrl, provider, contentType, resumePositionSeconds = 0, watchCompleted = false, baseUrl = "http://localhost" }) {
    try {
        const url = new URL(sourceUrl, baseUrl);
        const providerKey = provider?.key;
        const shouldResume = resumePositionSeconds > 0 &&
            !watchCompleted &&
            shouldApplyProviderResume(providerKey, contentType);
        applyProviderEmbedParams(url, providerKey, contentType);
        if (provider?.progress?.resumeParam && shouldForceProviderStartPosition(providerKey)) {
            url.searchParams.set(provider.progress.resumeParam, String(shouldResume ? resumePositionSeconds : 0));
        }
        else if (shouldResume && provider?.progress?.resumeParam) {
            url.searchParams.set(provider.progress.resumeParam, String(resumePositionSeconds));
        }
        return url.toString();
    }
    catch {
        return sourceUrl;
    }
}
export function shouldDisableProviderSubtitles(providerKey) {
    return providerKey === "vidplays";
}
export function postMessageToPlayer(iframe, command, params) {
    if (!iframe?.contentWindow)
        return;
    iframe.contentWindow.postMessage({ command, ...params }, "*");
}
export function createPlayerControls(iframeRef) {
    return {
        play: () => postMessageToPlayer(iframeRef.current, "play"),
        pause: () => postMessageToPlayer(iframeRef.current, "pause"),
        seek: (time) => postMessageToPlayer(iframeRef.current, "seek", { time }),
        setVolume: (level) => postMessageToPlayer(iframeRef.current, "volume", { level }),
        mute: (muted) => postMessageToPlayer(iframeRef.current, "mute", { muted }),
        getStatus: () => postMessageToPlayer(iframeRef.current, "getStatus")
    };
}
