import { useEffect, useRef, useState } from "react";
import { CustomVideoPlayer } from "./CustomVideoPlayer";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
import { ContentModal } from "@/ui/components/ContentModal";
import { useSeasonEpisodes } from "@/features/catalog/queries/useContent";
import { ProviderSourceSelect, type ProviderUiMode } from "@/ui/components/ProviderSourceSelect";
import { useGetProgress, useUpdateProgress } from "@/features/library/useWatchProgress";
import { useAppSettings } from "@/features/settings/useAppSettings";
import { useOneShotConvexQuery } from "@/shared/useOneShotConvexQuery";
import type { PlayerEventPayload } from "@fishy/providers/playback";
import {
  parsePlayerMessage,
  isTrustedPlayerMessageOrigin,
  postMessageToPlayer
} from "@fishy/providers/playback";
import {
  getNextEpisodeAddress,
  hasNextEpisode as hasProviderNextEpisode,
  isAnimeProviderContent,
  shouldWaitForAnimeSeasonMetadata,
  WATCH_PROGRESS_STATUS_POLL_MS
} from "@fishy/providers/playback";
import { buildWatchPath } from "@/shared/navigation/watchNavigation";
import type { ContentPlayback } from "@content/contentMetadata";
import {
  usePlaybackSession,
  type PlaybackSeasonMeta
} from "@/features/playback/usePlaybackSession";

interface VideoPlayerProps {
  content: ContentPlayback;
  initialSeason?: number;
  initialEpisode?: number;
  initialSource?: string;
}

const NEXT_EPISODE_CLICK_COOLDOWN_MS = 5000;
const ANIME_SEASON_SYNC_SESSION_KEY = "fishystream:anime-season-sync-keys";

function clamp(v: number) {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

function readSessionAnimeSeasonSyncKeys() {
  try {
    const raw = window.sessionStorage.getItem(ANIME_SEASON_SYNC_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberSessionAnimeSeasonSyncKey(key: string) {
  try {
    const keys = readSessionAnimeSeasonSyncKeys();
    if (keys.includes(key)) return;
    window.sessionStorage.setItem(ANIME_SEASON_SYNC_SESSION_KEY, JSON.stringify([...keys, key]));
  } catch {}
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

  const syncAnimeSeasonPlaybackMeta = useAction(
    api.domains.seasons.seasonSync.syncAnimeSeasonPlaybackMeta
  );
  const updateProgress = useUpdateProgress();
  const watchState = useGetProgress(content._id);
  const animeContent = isAnimeProviderContent(content);

  const historyInitRef = useRef(false);
  const lastSyncedProgressRef = useRef(0);
  const lastSyncedPositionRef = useRef(0);
  const nextEpisodeClickLockedRef = useRef(false);
  const nextEpisodeCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNextEpisodeCooldown, setIsNextEpisodeCooldown] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [animeSeasonReloadKey, setAnimeSeasonReloadKey] = useState(0);
  const animeSeasonSyncingRef = useRef<Set<string>>(new Set());
  const animeSeasonFailedRef = useRef<Set<string>>(new Set());

  const tvTargetRef = useRef({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const lastAppliedRouteTvTargetRef = useRef({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const loadedTvRef = useRef({ season: 1, episode: 1 });
  const [tvTarget, setTvTarget] = useState({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const hasPendingInitialTvTarget =
    content.type === "tv" && !!watchState && !historyInitRef.current;

  const { season: playbackSeason } = useSeasonEpisodes(
    content.type === "tv" && !hasPendingInitialTvTarget ? content.tmdbId : undefined,
    tvTarget.season,
    content.type === "tv" && !hasPendingInitialTvTarget
  );
  const clientSeasonData: PlaybackSeasonMeta | null =
    content.type === "tv" && playbackSeason
      ? ({
          seasonNumber: tvTarget.season,
          name: `Season ${tvTarget.season}`,
          airDate: undefined,
          episodeCount: playbackSeason.episodes.length,
          anilistId: tvTarget.season === 1 ? content.anilistId : undefined,
          anilistEpisodeMappings: undefined
        } satisfies PlaybackSeasonMeta)
      : null;
  const animeSeasonKey =
    animeContent && content.type === "tv" ? `${content._id}:${tvTarget.season}` : null;
  const animeSeasonData = useOneShotConvexQuery<PlaybackSeasonMeta | null>(
    !!animeSeasonKey && !hasPendingInitialTvTarget,
    (convex) =>
      convex.query(api.domains.seasons.seasons.getSeasonPlaybackMeta, {
        contentId: content._id,
        seasonNumber: tvTarget.season,
        episodeNumber: tvTarget.episode
      }),
    [content._id, tvTarget.season, tvTarget.episode, animeSeasonReloadKey],
    undefined,
    animeSeasonKey
      ? `animeSeasonPlayback:${animeSeasonKey}:${tvTarget.episode}:${animeSeasonReloadKey}`
      : undefined
  );
  const matchingAnimeSeasonData =
    animeSeasonData === null || animeSeasonData?.seasonNumber === tvTarget.season
      ? animeSeasonData
      : undefined;
  const currentSeasonData = matchingAnimeSeasonData ?? clientSeasonData;
  const currentSeasonEpisodeCount = currentSeasonData?.episodeCount;
  const waitingForAnimeSeasonMetadata =
    !!animeSeasonKey &&
    !animeSeasonFailedRef.current.has(animeSeasonKey) &&
    (shouldWaitForAnimeSeasonMetadata({
      contentType: content.type,
      isAnime: animeContent,
      seasonNumber: tvTarget.season,
      currentSeasonData: matchingAnimeSeasonData
    }) ||
      animeSeasonSyncingRef.current.has(animeSeasonKey) ||
      (matchingAnimeSeasonData === null &&
        !readSessionAnimeSeasonSyncKeys().includes(animeSeasonKey)));

  const session = usePlaybackSession({
    content,
    initialSeason,
    initialEpisode,
    initialSource,
    settings,
    watchState,
    currentSeasonData,
    waitingForAnimeSeasonMetadata,
    searchParams,
    setSearchParams,
    navigate,
    lastSyncedPositionRef,
    updateProgress
  });
  const {
    sources,
    selectedSource: selectedSourceConfig,
    selectedProvider,
    groupedSources,
    loading,
    error,
    isDub,
    showDubToggle,
    embedUrl,
    iframeSrcDoc,
    canTryNextSource,
    goToEpisode,
    currentProgress,
    reportPlaybackEvent
  } = session;
  const selectedSource = selectedSourceConfig?.url ?? "";
  const supportsProgressEvents = !!selectedProvider?.progress;
  const canRequestStatus = !!selectedProvider?.progress?.statusRequest;
  const iframeReferrerPolicy = selectedProvider?.referrerPolicy ?? "no-referrer-when-downgrade";

  useEffect(() => {
    loadedTvRef.current = session.loadedTarget;
  }, [session.loadedTarget]);

  useEffect(() => {
    if (!animeSeasonKey || !content.tmdbId || hasPendingInitialTvTarget) return;
    if (animeSeasonData !== null) return;
    if (animeSeasonSyncingRef.current.has(animeSeasonKey)) return;
    if (readSessionAnimeSeasonSyncKeys().includes(animeSeasonKey)) return;

    animeSeasonSyncingRef.current.add(animeSeasonKey);
    void syncAnimeSeasonPlaybackMeta({
      contentId: content._id,
      tmdbId: content.tmdbId,
      title: content.title,
      seasonNumber: tvTarget.season
    })
      .then((result) => {
        rememberSessionAnimeSeasonSyncKey(animeSeasonKey);
        if (!result) {
          animeSeasonFailedRef.current.add(animeSeasonKey);
        }
        setAnimeSeasonReloadKey((value) => value + 1);
      })
      .catch(() => {
        animeSeasonFailedRef.current.add(animeSeasonKey);
        rememberSessionAnimeSeasonSyncKey(animeSeasonKey);
        setAnimeSeasonReloadKey((value) => value + 1);
      })
      .finally(() => {
        animeSeasonSyncingRef.current.delete(animeSeasonKey);
      });
  }, [
    animeSeasonData,
    animeSeasonKey,
    content._id,
    content.tmdbId,
    content.title,
    hasPendingInitialTvTarget,
    syncAnimeSeasonPlaybackMeta,
    tvTarget.season
  ]);

  useEffect(() => {
    historyInitRef.current = false;
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;
    const s = initialSeason ?? 1;
    const e = initialEpisode ?? 1;
    lastAppliedRouteTvTargetRef.current = { season: s, episode: e };
    tvTargetRef.current = { season: s, episode: e };
    loadedTvRef.current = { season: s, episode: e };
    setTvTarget({ season: s, episode: e });
  }, [content._id]);

  useEffect(() => {
    const s = initialSeason ?? 1;
    const e = initialEpisode ?? 1;
    if (
      lastAppliedRouteTvTargetRef.current.season === s &&
      lastAppliedRouteTvTargetRef.current.episode === e
    ) {
      return;
    }

    lastAppliedRouteTvTargetRef.current = { season: s, episode: e };

    if (tvTargetRef.current.season !== s || tvTargetRef.current.episode !== e) {
      lastSyncedProgressRef.current = 0;
      lastSyncedPositionRef.current = 0;
      tvTargetRef.current = { season: s, episode: e };
      setTvTarget({ season: s, episode: e });
    }
  }, [initialSeason, initialEpisode]);

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
          goToEpisode({ season: s, episode: e });
        }
      }
    }
  }, [content._id, content.type, watchState, initialSeason, initialEpisode, goToEpisode]);

  useEffect(() => {
    if (!watchState) return;
    if (isMatchingEpisodeProgress(content, watchState, tvTarget.season, tvTarget.episode)) {
      lastSyncedPositionRef.current = Math.max(
        lastSyncedPositionRef.current,
        Math.max(0, watchState.positionSeconds)
      );
      return;
    }
  }, [content, tvTarget.episode, tvTarget.season, watchState]);

  const useCustomPlayer = searchParams.get("ui") === "custom";

  useEffect(() => {
    if (!embedUrl || !supportsProgressEvents || useCustomPlayer) return;

    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(embedUrl).origin;
    } catch {
      return;
    }

    const handleMsg = (event: MessageEvent) => {
      const originMatchesProvider = isTrustedPlayerMessageOrigin(event.origin, expectedOrigin);
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

      const parsed = parsePlayerMessage(event.data);
      if (!parsed) return;

      const { event: ev, currentTime, duration, progress } = parsed.data;
      reportPlaybackEvent({
        event: ev,
        currentTime: currentTime ?? 0,
        duration: duration ?? 0,
        progress
      });
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
    animeContent,
    isDub,
    useCustomPlayer,
    reportPlaybackEvent
  ]);

  const handleProviderSelect = async (nextUrl: string, mode: ProviderUiMode) => {
    if (!nextUrl) return;

    const nextParams = new URLSearchParams(searchParams);
    if (mode === "custom") {
      nextParams.set("ui", "custom");
    } else {
      nextParams.delete("ui");
    }

    setSearchParams(nextParams, { replace: true });
    await session.setSourceByUrl(nextUrl, nextParams);
  };

  const handleDubToggle = (newIsDub: boolean) => {
    session.setDub(newIsDub);
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

  const handleNextEpisode = async (options: { fromClick?: boolean } = {}) => {
    if (options.fromClick) {
      if (nextEpisodeClickLockedRef.current) return;
      startNextEpisodeClickCooldown();
    }

    if (content.type !== "tv") return;

    const currentSeason = tvTargetRef.current.season;
    const currentEpisode = tvTargetRef.current.episode;
    const effectiveSeasonEpisodeCount = currentSeasonEpisodeCount;

    const next = getNextEpisodeAddress({
      tmdbId: content.tmdbId,
      currentSeason,
      currentEpisode,
      fallbackSeasonCount: content.seasons,
      currentSeasonEpisodeCount: effectiveSeasonEpisodeCount
    });
    if (!next) return;

    tvTargetRef.current = next;
    setTvTarget(next);
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;

    goToEpisode(next);
  };

  const hasNextEpisode = (() => {
    if (content.type !== "tv") return false;
    const knownSeasonCount =
      typeof content.seasons === "number" && content.seasons > 0 ? content.seasons : undefined;
    if (
      knownSeasonCount !== undefined &&
      tvTarget.season >= knownSeasonCount &&
      currentSeasonEpisodeCount
    ) {
      return tvTarget.episode < currentSeasonEpisodeCount;
    }
    return hasProviderNextEpisode({
      tmdbId: content.tmdbId,
      currentSeason: tvTarget.season,
      currentEpisode: tvTarget.episode,
      fallbackSeasonCount: content.seasons,
      currentSeasonEpisodeCount
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
          <p className="text-sm text-white/70">Finding sources</p>
        </div>
      </div>
    );
  }

  if (error || !sources.length || !selectedSourceConfig) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-destructive/20">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-white">No source</h2>
          {error ? <p className="mb-6 text-sm text-white/50">{error}</p> : null}
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button onClick={() => session.retry()} variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            {canTryNextSource && (
              <Button
                onClick={() => session.tryNextSource("no sources screen")}
                variant="secondary"
              >
                <MonitorPlay className="w-4 h-4 mr-2" />
                Next source
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {!useCustomPlayer && (
        <div className="flex-none border-b border-white/10 bg-black/90 backdrop-blur-sm z-10 transition-all duration-300">
          <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 shrink-0"
                onClick={() => navigate(-1)}
                aria-label="Back"
                title="Back"
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

              <ProviderSourceSelect
                groupedSources={groupedSources}
                selectedSource={selectedSource}
                useCustomPlayer={useCustomPlayer}
                onSelect={handleProviderSelect}
                variant="header"
                className="sm:w-55"
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 shrink-0"
                onClick={() => setShowInfoModal(true)}
                aria-label="Content info"
                title="Content info"
              >
                <Info className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative bg-black group/player overflow-hidden flex items-center justify-center">
        {useCustomPlayer ? (
          <CustomVideoPlayer
            embedUrl={embedUrl}
            content={content}
            tvTarget={tvTarget}
            animeContent={animeContent}
            isDub={isDub}
            onPlaybackEvent={reportPlaybackEvent}
            showDubToggle={showDubToggle}
            handleDubToggle={handleDubToggle}
            selectedSource={selectedSource}
            onSelectProvider={handleProviderSelect}
            groupedSources={groupedSources}
            onInfoClick={() => setShowInfoModal(true)}
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            srcDoc={iframeSrcDoc}
            className="w-full h-full border-0"
            allowFullScreen
            allow="fullscreen *; picture-in-picture *; encrypted-media *"
            title={`Playing ${content.title}`}
            referrerPolicy={iframeReferrerPolicy as any}
          />
        )}

        {showNextEpisodeButton && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleNextEpisode({ fromClick: true });
            }}
            disabled={isNextEpisodeCooldown}
            className="absolute bottom-23 left-4 right-4 gap-2 bg-black/70 border border-white/20 text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60 backdrop-blur-sm sm:left-auto"
            aria-label="Play next episode"
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
        onPlay={(_tmdbId, season, episode, source, dub, type) => {
          setShowInfoModal(false);
          const nextSource = source ?? searchParams.get("source");
          const path = buildWatchPath({
            tmdbId: content.tmdbId ?? _tmdbId,
            type: type ?? content.type,
            season,
            episode,
            source: nextSource ?? undefined,
            dub: dub ?? isDub
          });
          navigate({ search: path.split("?")[1] ?? "" }, { replace: true });
        }}
      />
    </div>
  );
}
