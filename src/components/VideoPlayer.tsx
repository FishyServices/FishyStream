import { Fragment, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  MonitorPlay,
  RefreshCw,
  SkipForward,
  Mic2,
  Info
} from "lucide-react";
import { Button } from "@fishy/ui";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ContentModal } from "@/components/ContentModal";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@fishy/ui";
import { useGetProgress, useUpdateProgress } from "@/hooks/useWatchProgress";
import { useAppSettings } from "@/hooks/useAppSettings";
import type { PlayerEventPayload } from "@fishy/providers/playerProviders";
import {
  createProviderEmbedUrl,
  parsePlayerMessage,
  calculateProgress,
  isKnownPlayerOrigin,
  postMessageToPlayer,
  shouldDisableProviderSubtitles
} from "@fishy/providers/playerProviders";
import {
  buildMovieSources,
  buildTvSources,
  getProviderByKey
} from "@fishy/providers/providerCatalog";
import type { StreamSource } from "@fishy/providers/providerCatalog";
import {
  getNextEpisodeAddress,
  getSeasonYear,
  groupSourcesByProviderCategory,
  hasAnimeEpisodeMappingMetadata,
  hasNextEpisode as hasProviderNextEpisode,
  isAnimeProviderContent,
  pickPreferredSource,
  shouldWaitForAnimeSeasonMetadata
} from "@fishy/providers/providerPlayback";
import type { ContentPlayback } from "../../shared/contentMetadata";

interface VideoPlayerProps {
  content: ContentPlayback;
  initialSeason?: number;
  initialEpisode?: number;
  initialSource?: string;
}

const NEXT_EPISODE_CLICK_COOLDOWN_MS = 5000;

function clamp(v: number) {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

function safeEp(v: number | null | undefined) {
  return v != null && Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1;
}

function isMatchingEpisodeProgress(
  content: ContentPlayback,
  watchState: ReturnType<typeof useGetProgress>,
  season: number,
  episode: number
) {
  if (content.type !== "tv") return true;
  if (!watchState) return false;
  return safeEp(watchState.seasonNumber) === season && safeEp(watchState.episodeNumber) === episode;
}

function getResumePositionSeconds(
  content: ContentPlayback,
  watchState: ReturnType<typeof useGetProgress>,
  lastSyncedPosition: number,
  season: number,
  episode: number
) {
  if (!isMatchingEpisodeProgress(content, watchState, season, episode)) return 0;
  const storedPosition = Math.max(0, watchState?.positionSeconds ?? 0);
  return Math.max(storedPosition, Math.max(0, lastSyncedPosition));
}

function pickResumePositionSeconds(
  content: ContentPlayback,
  watchState: ReturnType<typeof useGetProgress>,
  lastSyncedPosition: number,
  season: number,
  episode: number
) {
  return Math.floor(
    getResumePositionSeconds(content, watchState, lastSyncedPosition, season, episode)
  );
}

export function VideoPlayer({
  content,
  initialSeason,
  initialEpisode,
  initialSource
}: VideoPlayerProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { settings } = useAppSettings();

  const syncSeason = useAction(api.tmdb.syncSeason);
  const updateProgress = useUpdateProgress();
  const watchState = useGetProgress(content._id);
  const animeContent = isAnimeProviderContent(content);

  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const isDub = searchParams.get("dub") === "true";
  const prefersDub = settings.defaultAnimeLanguage === "dub";

  const historyInitRef = useRef(false);
  const realtimeDetectedRef = useRef(false);
  const lastSyncedProgressRef = useRef(0);
  const lastSyncedPositionRef = useRef(0);
  const lastRealtimeSyncAtRef = useRef(0);
  const sourceRequestIdRef = useRef(0);
  const seasonSyncRequestRef = useRef<string | null>(null);
  const nextEpisodeClickLockedRef = useRef(false);
  const nextEpisodeCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resumePositionSeconds, setResumePositionSeconds] = useState(0);
  const [freshAnimeSeasonKeys, setFreshAnimeSeasonKeys] = useState<string[]>([]);
  const [isNextEpisodeCooldown, setIsNextEpisodeCooldown] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const tvTargetRef = useRef({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const loadedTvRef = useRef({ season: 1, episode: 1 });
  const [tvTarget, setTvTarget] = useState({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });

  const currentSeasonData = useQuery(
    api.seasons.getSeasonPlaybackMeta,
    content.type === "tv"
      ? {
          contentId: content._id,
          seasonNumber: tvTarget.season,
          episodeNumber: tvTarget.episode,
          includeAnimeMappings: animeContent
        }
      : "skip"
  );
  const currentSeasonKey = content.type === "tv" ? `${content._id}:${tvTarget.season}` : null;
  const hasFreshAnimeSeasonMetadata =
    !animeContent || !currentSeasonKey || freshAnimeSeasonKeys.includes(currentSeasonKey);
  const waitingForAnimeSeasonMetadata =
    shouldWaitForAnimeSeasonMetadata({
      contentType: content.type,
      isAnime: animeContent,
      seasonNumber: tvTarget.season,
      currentSeasonData
    }) ||
    (animeContent && !hasFreshAnimeSeasonMetadata);

  useEffect(() => {
    if (content.type !== "tv" || !content.tmdbId) return;

    const shouldSyncSeason =
      currentSeasonData === null ||
      (animeContent &&
        !hasFreshAnimeSeasonMetadata &&
        (!currentSeasonData?.anilistId || !hasAnimeEpisodeMappingMetadata(currentSeasonData)));
    if (!shouldSyncSeason) return;

    const key = `${content._id}:${tvTarget.season}`;
    if (seasonSyncRequestRef.current === key) return;
    seasonSyncRequestRef.current = key;

    void syncSeason({
      tmdbId: content.tmdbId,
      contentId: content._id,
      seasonNumber: tvTarget.season
    })
      .catch(() => {})
      .finally(() => {
        if (animeContent) {
          setFreshAnimeSeasonKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
        }
        if (seasonSyncRequestRef.current === key) {
          seasonSyncRequestRef.current = null;
        }
      });
  }, [
    currentSeasonKey,
    animeContent,
    content._id,
    content.tmdbId,
    content.type,
    currentSeasonData,
    hasFreshAnimeSeasonMetadata,
    syncSeason,
    tvTarget.season
  ]);

  useEffect(() => {
    setFreshAnimeSeasonKeys([]);
  }, [content._id]);

  useEffect(() => {
    if (!animeContent || !currentSeasonKey) return;
    setFreshAnimeSeasonKeys((keys) => keys.filter((key) => key !== currentSeasonKey));
  }, [animeContent, currentSeasonKey]);

  useEffect(() => {
    if (!animeContent || !currentSeasonKey || seasonSyncRequestRef.current) return;
    if (currentSeasonData?.seasonNumber !== tvTarget.season) return;
    if (!currentSeasonData?.anilistId) return;
    if (!hasAnimeEpisodeMappingMetadata(currentSeasonData)) return;

    setFreshAnimeSeasonKeys((keys) =>
      keys.includes(currentSeasonKey) ? keys : [...keys, currentSeasonKey]
    );
  }, [animeContent, currentSeasonData, currentSeasonKey, syncSeason, tvTarget.season]);

  useEffect(() => {
    sourceRequestIdRef.current += 1;
    setSources([]);
    setSelectedSource("");
    setLoading(true);
    setError(null);
    historyInitRef.current = false;
    realtimeDetectedRef.current = false;
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;
    lastRealtimeSyncAtRef.current = 0;
    setResumePositionSeconds(0);
    const s = initialSeason ?? 1;
    const e = initialEpisode ?? 1;
    tvTargetRef.current = { season: s, episode: e };
    loadedTvRef.current = { season: s, episode: e };
    setTvTarget({ season: s, episode: e });
  }, [content._id]);

  useEffect(() => {
    const s = initialSeason ?? 1;
    const e = initialEpisode ?? 1;
    if (tvTargetRef.current.season !== s || tvTargetRef.current.episode !== e) {
      setCurrentProgress(0);
      setResumePositionSeconds(0);
      realtimeDetectedRef.current = false;
      lastSyncedProgressRef.current = 0;
      lastSyncedPositionRef.current = 0;
      lastRealtimeSyncAtRef.current = 0;
      tvTargetRef.current = { season: s, episode: e };
      setTvTarget({ season: s, episode: e });
    }
  }, [initialSeason, initialEpisode]);

  useEffect(() => {
    if (content.type !== "tv") return;
    if (
      loadedTvRef.current.season === tvTarget.season &&
      loadedTvRef.current.episode === tvTarget.episode
    ) {
      return;
    }

    sourceRequestIdRef.current += 1;
    setSources([]);
    setSelectedSource("");
    setLoading(true);
    setError(null);
  }, [content.type, tvTarget.episode, tvTarget.season]);

  useEffect(() => {
    if (historyInitRef.current) return;
    if (!watchState) return;

    historyInitRef.current = true;
    lastSyncedProgressRef.current = clamp(watchState.progress);
    lastSyncedPositionRef.current = Math.max(0, watchState.positionSeconds);

    if (content.type === "tv") {
      const hasExplicitInitials = initialSeason !== undefined || initialEpisode !== undefined;
      const hasSavedProgress =
        watchState.positionSeconds > 0 ||
        watchState.progress > 0 ||
        (watchState.seasonNumber != null && watchState.seasonNumber !== 1) ||
        (watchState.episodeNumber != null && watchState.episodeNumber !== 1);

      if (hasExplicitInitials || hasSavedProgress) {
        const s =
          initialSeason !== undefined ? safeEp(initialSeason) : safeEp(watchState.seasonNumber);
        const e =
          initialEpisode !== undefined ? safeEp(initialEpisode) : safeEp(watchState.episodeNumber);
        if (tvTargetRef.current.season !== s || tvTargetRef.current.episode !== e) {
          tvTargetRef.current = { season: s, episode: e };
          setTvTarget({ season: s, episode: e });
        }
      }
    }
  }, [content._id, content.type, watchState, initialSeason, initialEpisode]);

  useEffect(() => {
    if (sources.length > 0 || error) return;
    if (waitingForAnimeSeasonMetadata) return;

    const load = async () => {
      if (!content.imdbId && !content.tmdbId) {
        setError("No video ID available for this content");
        setLoading(false);
        return;
      }

      const requestId = ++sourceRequestIdRef.current;

      try {
        setLoading(true);
        const { season, episode } = tvTargetRef.current;
        const fetched =
          content.type === "tv"
            ? await buildTvSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined,
                anilistId:
                  currentSeasonData?.anilistId ??
                  (season === 1 ? content.anilistId : undefined) ??
                  undefined,
                anilistEpisodeMappings: currentSeasonData?.anilistEpisodeMappings,
                isAnime: animeContent,
                title: content.title,
                seasonTitle: currentSeasonData?.name,
                year: getSeasonYear(currentSeasonData?.airDate) ?? content.year,
                season,
                episode,
                dub: animeContent ? isDub || (!searchParams.has("dub") && prefersDub) : undefined
              })
            : buildMovieSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined
              });

        if (requestId !== sourceRequestIdRef.current) {
          return;
        }
        if (!fetched?.length) {
          setError("No streaming sources found for this content");
          setLoading(false);
          return;
        }

        loadedTvRef.current = { season, episode };
        setSources(fetched);
        const def = pickPreferredSource(fetched, {
          initialSource,
          defaultProvider: settings.defaultProvider
        })!;
        setResumePositionSeconds(
          pickResumePositionSeconds(
            content,
            watchState,
            lastSyncedPositionRef.current,
            season,
            episode
          )
        );
        setSelectedSource(def.url);
      } catch (err) {
        if (requestId !== sourceRequestIdRef.current) {
          return;
        }
        setError(
          `Failed to load streaming sources: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        if (requestId !== sourceRequestIdRef.current) return;
        setLoading(false);
      }
    };

    load();
  }, [
    animeContent,
    content,
    error,
    initialSource,
    isDub,
    prefersDub,
    settings.defaultProvider,
    sources.length,
    watchState,
    searchParams,
    currentSeasonData?.name,
    currentSeasonData?.anilistId,
    currentSeasonData?.anilistEpisodeMappings,
    currentSeasonData?.airDate,
    waitingForAnimeSeasonMetadata
  ]);

  const selectedSourceConfig = sources.find((s) => s.url === selectedSource);
  const selectedProvider = selectedSourceConfig
    ? getProviderByKey(selectedSourceConfig.key)
    : undefined;
  const groupedSources = groupSourcesByProviderCategory(sources);
  const supportsProgressEvents = !!selectedProvider?.progress;
  const canRequestStatus = !!selectedProvider?.progress?.statusRequest;
  const showDubToggle = animeContent && !!selectedProvider?.dubSupport;
  const iframeReferrerPolicy =
    selectedProvider?.progress?.referrerPolicy ?? "no-referrer-when-downgrade";

  const embedUrl = (() => {
    if (!selectedSourceConfig) return "";
    return createProviderEmbedUrl({
      sourceUrl: selectedSourceConfig.url,
      provider: selectedProvider,
      contentType: content.type,
      resumePositionSeconds,
      watchCompleted: watchState?.completed ?? false,
      baseUrl: window.location.origin
    });
  })();

  const iframeSrcDoc =
    iframeReferrerPolicy === "no-referrer" && embedUrl
      ? `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><script>location.replace(${JSON.stringify(embedUrl)})<\/script></body></html>`
      : undefined;

  useEffect(() => {
    if (!watchState) return;
    if (isMatchingEpisodeProgress(content, watchState, tvTarget.season, tvTarget.episode)) {
      setCurrentProgress(clamp(watchState.progress));
      lastSyncedPositionRef.current = Math.max(
        lastSyncedPositionRef.current,
        Math.max(0, watchState.positionSeconds)
      );
      return;
    }

    setCurrentProgress(0);
  }, [content, tvTarget.episode, tvTarget.season, watchState]);

  useEffect(() => {
    if (!embedUrl || !supportsProgressEvents || !canRequestStatus) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const requestStatus = () => postMessageToPlayer(iframeRef.current, "getStatus");
    const onLoad = () => {
      window.setTimeout(requestStatus, 1500);
    };

    iframe.addEventListener("load", onLoad);
    requestStatus();

    const interval = window.setInterval(requestStatus, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestStatus();
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      iframe.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [canRequestStatus, embedUrl, supportsProgressEvents]);

  useEffect(() => {
    if (!embedUrl || !shouldDisableProviderSubtitles(selectedProvider?.key)) return;

    const disableVidPlaysSubtitles = () => {
      postMessageToPlayer(iframeRef.current, "setSubtitle", { trackId: 0 });
    };
    const iframe = iframeRef.current;

    iframe?.addEventListener("load", disableVidPlaysSubtitles);
    const timers = [500, 1500, 3000].map((delay) =>
      window.setTimeout(disableVidPlaysSubtitles, delay)
    );

    return () => {
      iframe?.removeEventListener("load", disableVidPlaysSubtitles);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [embedUrl, selectedProvider?.key]);

  useEffect(() => {
    if (!embedUrl || !supportsProgressEvents) return;

    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(embedUrl).origin;
    } catch {
      return;
    }

    let syncInFlight = false;

    const handleMsg = (event: MessageEvent) => {
      const originMatchesProvider = isKnownPlayerOrigin(event.origin);
      if (!originMatchesProvider && event.origin !== expectedOrigin) return;
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow)
        return;

      if (
        content.type === "tv" &&
        (tvTargetRef.current.season !== loadedTvRef.current.season ||
          tvTargetRef.current.episode !== loadedTvRef.current.episode)
      ) {
        return;
      }

      const payload = parsePlayerMessage(event.data, event.origin);
      if (!payload) return;

      const { data } = payload as PlayerEventPayload;
      if (data.mediaType !== content.type) return;

      const nextPos = Math.max(0, data.currentTime || 0);
      const nextDur = Math.max(0, data.duration || 0);
      const nextProgress =
        data.progress !== undefined ? clamp(data.progress) : calculateProgress(nextPos, nextDur);

      setCurrentProgress(nextProgress);

      if (syncInFlight) return;

      const isForced = data.event !== "timeupdate";
      const meaningful =
        Math.abs(nextPos - lastSyncedPositionRef.current) >= 10 ||
        Math.abs(nextProgress - lastSyncedProgressRef.current) >= 2 ||
        Date.now() - lastRealtimeSyncAtRef.current >= 60_000;

      if (!isForced && !meaningful) return;

      const persistedSeason = content.type === "tv" ? tvTargetRef.current.season : undefined;
      const persistedEpisode = content.type === "tv" ? tvTargetRef.current.episode : undefined;

      realtimeDetectedRef.current = true;
      syncInFlight = true;

      updateProgress(
        content._id,
        nextProgress,
        data.event === "ended" || nextProgress >= 95,
        nextPos,
        nextDur,
        persistedSeason,
        persistedEpisode,
        selectedSourceConfig?.name,
        animeContent ? isDub : undefined
      );

      lastSyncedProgressRef.current = nextProgress;
      lastSyncedPositionRef.current = nextPos;
      lastRealtimeSyncAtRef.current = Date.now();
      syncInFlight = false;
    };

    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, [
    content._id,
    content.tmdbId,
    content.type,
    embedUrl,
    selectedSourceConfig,
    supportsProgressEvents,
    updateProgress
  ]);

  const handleSourceChange = async (nextUrl: string | null) => {
    if (!nextUrl) return;
    const nextSource = sources.find((s) => s.url === nextUrl);
    const prevName = nextSource?.name;
    const needsReload =
      content.type === "tv" &&
      (tvTargetRef.current.season !== loadedTvRef.current.season ||
        tvTargetRef.current.episode !== loadedTvRef.current.episode);

    realtimeDetectedRef.current = false;

    if (nextSource) {
      const params = new URLSearchParams(searchParams);
      params.set("source", nextSource.name);
      navigate({ search: params.toString() }, { replace: true });
    }

    if (!needsReload) {
      setResumePositionSeconds(
        pickResumePositionSeconds(
          content,
          watchState,
          lastSyncedPositionRef.current,
          tvTargetRef.current.season,
          tvTargetRef.current.episode
        )
      );
      setSelectedSource(nextUrl);
      return;
    }

    try {
      setLoading(true);
      if (waitingForAnimeSeasonMetadata) return;
      const requestId = ++sourceRequestIdRef.current;
      const refreshed = await buildTvSources({
        imdbId: content.imdbId ?? undefined,
        tmdbId: content.tmdbId ?? undefined,
        anilistId:
          currentSeasonData?.anilistId ??
          (tvTargetRef.current.season === 1 ? content.anilistId : undefined) ??
          undefined,
        anilistEpisodeMappings: currentSeasonData?.anilistEpisodeMappings,
        isAnime: animeContent,
        title: content.title,
        seasonTitle: currentSeasonData?.name,
        year: getSeasonYear(currentSeasonData?.airDate) ?? content.year,
        season: tvTargetRef.current.season,
        episode: tvTargetRef.current.episode,
        dub: animeContent ? isDub || (!searchParams.has("dub") && prefersDub) : undefined
      });

      if (requestId !== sourceRequestIdRef.current) {
        return;
      }
      if (!refreshed?.length) {
        setError("No sources for this episode");
        return;
      }

      loadedTvRef.current = { ...tvTargetRef.current };
      setSources(refreshed);
      const next = refreshed.find((s) => s.name === prevName) ?? refreshed[0]!;
      setResumePositionSeconds(
        pickResumePositionSeconds(
          content,
          watchState,
          lastSyncedPositionRef.current,
          tvTargetRef.current.season,
          tvTargetRef.current.episode
        )
      );
      setSelectedSource(next.url);
    } catch (err) {
      setError(`Failed to switch sources: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDubToggle = (newIsDub: boolean) => {
    if (newIsDub === isDub) return;
    const params = new URLSearchParams(searchParams);
    if (newIsDub) {
      params.set("dub", "true");
    } else {
      params.delete("dub");
    }
    setSearchParams(params, { replace: true });
    sourceRequestIdRef.current += 1;
    setSources([]);
    setSelectedSource("");
    setLoading(true);
    setError(null);
  };

  const startNextEpisodeClickCooldown = () => {
    nextEpisodeClickLockedRef.current = true;
    setIsNextEpisodeCooldown(true);

    if (nextEpisodeCooldownTimeoutRef.current) {
      clearTimeout(nextEpisodeCooldownTimeoutRef.current);
    }

    nextEpisodeCooldownTimeoutRef.current = setTimeout(() => {
      nextEpisodeClickLockedRef.current = false;
      nextEpisodeCooldownTimeoutRef.current = null;
      setIsNextEpisodeCooldown(false);
    }, NEXT_EPISODE_CLICK_COOLDOWN_MS);
  };

  const handleNextEpisode = (options: { fromClick?: boolean } = {}) => {
    if (options.fromClick) {
      if (nextEpisodeClickLockedRef.current) return;
      startNextEpisodeClickCooldown();
    }

    if (content.type !== "tv") return;

    const currentSeason = tvTargetRef.current.season;
    const currentEpisode = tvTargetRef.current.episode;
    const next = getNextEpisodeAddress({
      tmdbId: content.tmdbId,
      currentSeason,
      currentEpisode,
      fallbackSeasonCount: content.seasons,
      currentSeasonEpisodeCount: currentSeasonData?.episodeCount
    });
    if (!next) return;

    tvTargetRef.current = next;
    setTvTarget(next);
    setCurrentProgress(0);
    setResumePositionSeconds(0);
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;
    lastRealtimeSyncAtRef.current = 0;
    realtimeDetectedRef.current = false;

    const params = new URLSearchParams();
    params.set("season", String(next.season));
    params.set("episode", String(next.episode));
    const currentSource = searchParams.get("source");
    if (currentSource) {
      params.set("source", currentSource);
    }
    if (isDub) {
      params.set("dub", "true");
    }
    navigate({ search: params.toString() }, { replace: true });

    sourceRequestIdRef.current += 1;
    setSources([]);
    setLoading(true);
    setError(null);
  };

  const hasNextEpisode = (() => {
    if (content.type !== "tv") return false;
    return hasProviderNextEpisode({
      tmdbId: content.tmdbId,
      currentSeason: tvTarget.season,
      currentEpisode: tvTarget.episode,
      fallbackSeasonCount: content.seasons,
      currentSeasonEpisodeCount: currentSeasonData?.episodeCount
    });
  })();

  const matchingEpisodeWatchProgress =
    content.type === "tv" &&
    isMatchingEpisodeProgress(content, watchState, tvTarget.season, tvTarget.episode)
      ? clamp(watchState?.progress ?? 0)
      : 0;
  const nextEpisodeProgress = Math.max(currentProgress, matchingEpisodeWatchProgress);
  const showNextEpisodeFallback = content.type === "tv" && hasNextEpisode && !canRequestStatus;
  const showNextEpisodeButton =
    content.type === "tv" &&
    hasNextEpisode &&
    (nextEpisodeProgress >= 80 || showNextEpisodeFallback);
  const autoAdvancedRef = useRef<string | null>(null);

  useEffect(() => {
    if (content.type !== "tv") return;
    if (!settings.autoAdvanceEpisodes) return;
    if (!showNextEpisodeButton) return;
    if (nextEpisodeProgress < 98) return;

    const key = `${content._id}:${tvTarget.season}:${tvTarget.episode}`;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    handleNextEpisode();
  }, [
    content._id,
    content.type,
    nextEpisodeProgress,
    settings.autoAdvanceEpisodes,
    showNextEpisodeButton,
    tvTarget.episode,
    tvTarget.season
  ]);

  useEffect(() => {
    autoAdvancedRef.current = null;
  }, [content._id, tvTarget.season, tvTarget.episode]);

  useEffect(() => {
    return () => {
      if (nextEpisodeCooldownTimeoutRef.current) {
        clearTimeout(nextEpisodeCooldownTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/70 text-sm">Finding streaming sources…</p>
        </div>
      </div>
    );
  }

  if (error || !sources.length || !selectedSourceConfig) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Sources Available</h2>
          <p className="text-white/50 mb-6 text-sm">
            {error ?? "Could not find any streaming sources for this content."}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={() => {
                setError(null);
                setSources([]);
              }}
              variant="secondary"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-white/10 bg-black/90 backdrop-blur-sm z-10">
        <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 shrink-0"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white truncate">{content.title}</h1>
              <p className="text-xs text-white/50 truncate">
                {content.type === "movie"
                  ? `Movie · ${content.year}`
                  : `TV Series · ${content.year} · S${tvTarget.season} E${tvTarget.episode}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            {showDubToggle && (
              <div className="flex items-center rounded-md border border-border/80 bg-card/90 overflow-hidden shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDubToggle(false)}
                  className={`flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs font-medium ${
                    !isDub
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Mic2 className="w-3 h-3" />
                  SUB
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDubToggle(true)}
                  className={`flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs font-medium ${
                    isDub
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Mic2 className="w-3 h-3" />
                  DUB
                </Button>
              </div>
            )}

            <Select value={selectedSource} onValueChange={handleSourceChange}>
              <SelectTrigger className="w-full border-border/80 bg-card/90 text-sm text-foreground sm:w-55">
                <MonitorPlay className="w-4 h-4 mr-1.5 shrink-0" />
                <SelectValue placeholder="Source">
                  {selectedSourceConfig ? selectedSourceConfig.name : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-50 border-border/80 bg-popover text-popover-foreground">
                {groupedSources.map((group, index) => (
                  <Fragment key={group.key}>
                    {index > 0 ? <SelectSeparator /> : null}
                    <SelectGroup>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.sources.map((source) => (
                        <SelectItem
                          key={source.url}
                          value={source.url}
                          className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </Fragment>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 shrink-0"
              onClick={() => setShowInfoModal(true)}
              title="Content info"
            >
              <Info className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Player */}
      <div className="flex-1 relative bg-black">
        <iframe
          ref={iframeRef}
          key={embedUrl}
          src={iframeSrcDoc ? undefined : embedUrl}
          srcDoc={iframeSrcDoc}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          title={`Playing ${content.title}`}
          referrerPolicy={iframeReferrerPolicy}
        />

        {showNextEpisodeButton && (
          <Button
            onClick={() => handleNextEpisode({ fromClick: true })}
            disabled={isNextEpisodeCooldown}
            className="absolute bottom-23 left-4 right-4 gap-2 bg-black/70 border border-white/20 text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60 backdrop-blur-sm sm:left-auto"
          >
            <SkipForward className="w-4 h-4" />
            Next Episode
          </Button>
        )}
      </div>

      <ContentModal
        content={
          {
            ...(content as Parameters<typeof ContentModal>[0]["content"]),
            seasonNumber: content.type === "tv" ? tvTarget.season : undefined,
            episodeNumber: content.type === "tv" ? tvTarget.episode : undefined
          } as Parameters<typeof ContentModal>[0]["content"]
        }
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        onPlay={(tmdbId, season, episode) => {
          setShowInfoModal(false);
          const params = new URLSearchParams();
          if (season !== undefined) params.set("season", String(season));
          if (episode !== undefined) params.set("episode", String(episode));
          const currentSource = searchParams.get("source");
          if (currentSource) params.set("source", currentSource);
          if (isDub) params.set("dub", "true");
          navigate({ search: params.toString() }, { replace: true });
        }}
      />
    </div>
  );
}
