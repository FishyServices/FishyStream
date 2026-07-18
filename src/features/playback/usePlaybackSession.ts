import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction, URLSearchParamsInit } from "react-router-dom";
import {
  calculateProgress,
  createProviderEmbedUrl,
  type ProviderContentType
} from "@fishy/providers/playback";
import { type ProviderCatalogEntry, type StreamSource } from "@fishy/providers/catalog";
import {
  isAnimeProviderContent,
  normalizePlaybackProgressSample,
  shouldStorePlaybackProgressSample
} from "@fishy/providers/playback";
import type { ProviderGroupedSources } from "@fishy/providers/playback";
import type { AppSettings } from "@/shared/config/appSettings";
import { logProviderInfo, logProviderWarning } from "./model/providerDiagnostics";
import type { ContentPlayback } from "@content/contentMetadata";
import type { ProgressState, useUpdateProgress } from "@/features/library/useWatchProgress";
import { providerSourceResolver } from "@fishy/providers/playback";

type UpdateProgress = ReturnType<typeof useUpdateProgress>;

export interface PlaybackEvent {
  event: "timeupdate" | "play" | "pause" | "ended" | "seeked" | "playerstatus";
  currentTime: number;
  duration: number;
  progress?: number;
  completed?: boolean;
}

export interface PlaybackTarget {
  season: number;
  episode: number;
}

export interface PlaybackSeasonMeta {
  seasonNumber: number;
  name?: string;
  airDate?: string;
  episodeCount?: number;
  anilistId?: string;
  anilistEpisodeMappings?: Array<{
    episodeNumber: number;
    anilistId: string;
    anilistEpisodeNumber: number;
  }>;
}

export interface PlaybackSession {
  target: PlaybackTarget;
  loadedTarget: PlaybackTarget;
  sources: StreamSource[];
  selectedSource?: StreamSource;
  selectedProvider?: ProviderCatalogEntry;
  groupedSources: ProviderGroupedSources[];
  loading: boolean;
  error: string | null;
  isDub: boolean;
  showDubToggle: boolean;
  resumePositionSeconds: number;
  embedUrl: string;
  iframeSrcDoc?: string;
  canTryNextSource: boolean;
  currentProgress: number;
  reportPlaybackEvent(event: PlaybackEvent): void;
  setSourceByUrl(url: string, params?: URLSearchParams): Promise<void>;
  setDub(enabled: boolean): void;
  goToEpisode(target: PlaybackTarget): void;
  retry(): void;
  tryNextSource(reason?: string): void;
}

export interface UsePlaybackSessionArgs {
  content: ContentPlayback;
  initialSeason?: number;
  initialEpisode?: number;
  initialSource?: string;
  settings: AppSettings;
  watchState?: ProgressState;
  currentSeasonData?: PlaybackSeasonMeta | null;
  waitingForAnimeSeasonMetadata?: boolean;
  searchParams: URLSearchParams;
  setSearchParams: (nextInit: URLSearchParamsInit, options?: { replace?: boolean }) => void;
  navigate: NavigateFunction;
  lastSyncedPositionRef: { current: number };
  updateProgress: UpdateProgress;
}

function safeEp(v: number | null | undefined) {
  return v != null && Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1;
}

function isMatchingEpisodeProgress(
  content: ContentPlayback,
  watchState: ProgressState | undefined,
  season: number,
  episode: number
) {
  if (content.type !== "tv") return true;
  if (!watchState) return false;
  return safeEp(watchState.seasonNumber) === season && safeEp(watchState.episodeNumber) === episode;
}

function pickResumePositionSeconds(
  content: ContentPlayback,
  watchState: ProgressState | undefined,
  lastSyncedPosition: number,
  season: number,
  episode: number
) {
  if (!isMatchingEpisodeProgress(content, watchState, season, episode)) return 0;
  const storedPosition = Math.max(0, watchState?.positionSeconds ?? 0);
  return Math.floor(Math.max(storedPosition, Math.max(0, lastSyncedPosition)));
}

function clampProgress(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function getEffectiveAnimeDub(searchParams: URLSearchParams, prefersDub: boolean) {
  if (searchParams.get("dub") === "true") return true;
  if (searchParams.get("dub") === "false") return false;
  return prefersDub;
}

export function setAnimeDubSearchParam(
  params: URLSearchParams,
  enabled: boolean,
  prefersDub: boolean
) {
  if (enabled || prefersDub) params.set("dub", String(enabled));
  else params.delete("dub");
}

export function usePlaybackSession({
  content,
  initialSeason,
  initialEpisode,
  initialSource,
  settings,
  watchState,
  currentSeasonData,
  waitingForAnimeSeasonMetadata = false,
  searchParams,
  setSearchParams,
  navigate,
  lastSyncedPositionRef,
  updateProgress
}: UsePlaybackSessionArgs): PlaybackSession {
  const animeContent = isAnimeProviderContent(content);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSourceUrl, setSelectedSourceUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const sourceRequestIdRef = useRef(0);
  const loadedTargetRef = useRef<PlaybackTarget>({ season: 1, episode: 1 });
  const targetRef = useRef<PlaybackTarget>({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const [target, setTarget] = useState<PlaybackTarget>({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const [loadedTarget, setLoadedTarget] = useState<PlaybackTarget>({ season: 1, episode: 1 });
  const [resumePositionSeconds, setResumePositionSeconds] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(0);
  const lastStoredProgressSampleRef = useRef<
    ReturnType<typeof normalizePlaybackProgressSample> | undefined
  >(undefined);
  const playbackSyncInFlightRef = useRef(false);
  const prefersDub = settings.defaultAnimeLanguage === "dub";
  const isDub = animeContent ? getEffectiveAnimeDub(searchParams, prefersDub) : false;

  useEffect(() => {
    if (!animeContent || !prefersDub || searchParams.has("dub")) return;

    const params = new URLSearchParams(searchParams);
    params.set("dub", "true");
    setSearchParams(params, { replace: true });
  }, [animeContent, prefersDub, searchParams, setSearchParams]);

  useEffect(() => {
    sourceRequestIdRef.current += 1;
    const next = { season: initialSeason ?? 1, episode: initialEpisode ?? 1 };
    targetRef.current = next;
    loadedTargetRef.current = next;
    setTarget(next);
    setLoadedTarget(next);
    setSources([]);
    setSelectedSourceUrl("");
    setLoading(true);
    setError(null);
    setResumePositionSeconds(0);
    setCurrentProgress(0);
    lastStoredProgressSampleRef.current = undefined;
  }, [content._id]);

  useEffect(() => {
    const next = { season: initialSeason ?? 1, episode: initialEpisode ?? 1 };
    if (targetRef.current.season === next.season && targetRef.current.episode === next.episode) {
      return;
    }

    targetRef.current = next;
    setTarget(next);
    setSources([]);
    setSelectedSourceUrl("");
    setLoading(true);
    setError(null);
    setResumePositionSeconds(0);
    setCurrentProgress(0);
    lastStoredProgressSampleRef.current = undefined;
  }, [initialSeason, initialEpisode]);

  useEffect(() => {
    if (
      !watchState ||
      !isMatchingEpisodeProgress(content, watchState, target.season, target.episode)
    ) {
      setCurrentProgress(0);
      return;
    }
    setCurrentProgress(clampProgress(watchState.progress));
  }, [content, target.episode, target.season, watchState]);

  const loadSources = useCallback(
    async (reason: string) => {
      const { season, episode } = targetRef.current;
      const hasMismatchedSeasonData =
        animeContent &&
        content.type === "tv" &&
        currentSeasonData !== undefined &&
        currentSeasonData !== null &&
        currentSeasonData.seasonNumber !== season;
      if (waitingForAnimeSeasonMetadata || hasMismatchedSeasonData) return;

      if (!content.imdbId && !content.tmdbId) {
        setError("No video ID available for this content");
        setLoading(false);
        return;
      }

      const requestId = ++sourceRequestIdRef.current;
      const startedAt = Date.now();
      setLoading(true);
      setError(null);

      try {
        const targetSeasonData =
          currentSeasonData?.seasonNumber === season ? currentSeasonData : undefined;

        const fetched =
          content.type === "tv"
            ? await providerSourceResolver.buildTvSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined,
                anilistId:
                  targetSeasonData?.anilistId ??
                  (season === 1 ? content.anilistId : undefined) ??
                  undefined,
                anilistEpisodeMappings: targetSeasonData?.anilistEpisodeMappings,
                isAnime: animeContent,
                title: content.title,
                seasonTitle: targetSeasonData?.name,
                year:
                  providerSourceResolver.getSeasonYear(targetSeasonData?.airDate) ?? content.year,
                season,
                episode,
                dub: animeContent ? isDub || (!searchParams.has("dub") && prefersDub) : undefined
              })
            : providerSourceResolver.buildMovieSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined
              });

        if (requestId !== sourceRequestIdRef.current) return;
        if (!fetched.length) {
          setSources([]);
          setSelectedSourceUrl("");
          setError("No streaming sources found for this content");
          return;
        }

        const selected =
          providerSourceResolver.pickSource(fetched, {
            initialSource,
            defaultProvider: settings.defaultProvider
          }) ?? fetched[0];

        loadedTargetRef.current = { season, episode };
        setLoadedTarget({ season, episode });
        setSources(fetched);
        setResumePositionSeconds(
          pickResumePositionSeconds(
            content,
            watchState,
            lastSyncedPositionRef.current,
            season,
            episode
          )
        );
        setSelectedSourceUrl(selected?.url ?? "");
        logProviderInfo({
          contentType: content.type,
          source: selected,
          message: reason,
          startedAt,
          endedAt: Date.now()
        });
      } catch (err) {
        if (requestId !== sourceRequestIdRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to load streaming sources: ${message}`);
        logProviderWarning({
          contentType: content.type,
          message,
          startedAt,
          endedAt: Date.now()
        });
      } finally {
        if (requestId === sourceRequestIdRef.current) setLoading(false);
      }
    },
    [
      animeContent,
      content,
      currentSeasonData?.airDate,
      currentSeasonData?.anilistEpisodeMappings,
      currentSeasonData?.anilistId,
      currentSeasonData?.name,
      currentSeasonData?.seasonNumber,
      initialSource,
      isDub,
      lastSyncedPositionRef,
      prefersDub,
      searchParams,
      settings.defaultProvider,
      waitingForAnimeSeasonMetadata,
      watchState
    ]
  );

  useEffect(() => {
    if (sources.length > 0 || error) return;
    void loadSources("load sources");
  }, [error, loadSources, reloadKey, sources.length]);

  const selectedSource = sources.find((source) => source.url === selectedSourceUrl);
  const selectedProvider = selectedSource
    ? providerSourceResolver.getProvider(selectedSource.key)
    : undefined;
  const groupedSources = useMemo(() => providerSourceResolver.groupSources(sources), [sources]);
  const showDubToggle = animeContent && !!selectedProvider?.dubSupport;
  const iframeReferrerPolicy = selectedProvider?.referrerPolicy ?? "no-referrer-when-downgrade";

  const embedUrl = useMemo(() => {
    if (!selectedSource) return "";
    return createProviderEmbedUrl({
      sourceUrl: selectedSource.url,
      provider: selectedProvider,
      contentType: content.type as ProviderContentType,
      resumePositionSeconds,
      watchCompleted: watchState?.completed ?? false,
      baseUrl: window.location.origin
    });
  }, [
    content.type,
    resumePositionSeconds,
    selectedProvider,
    selectedSource,
    watchState?.completed
  ]);

  const iframeSrcDoc =
    iframeReferrerPolicy === "no-referrer" && embedUrl
      ? `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><script>location.replace(${JSON.stringify(embedUrl)})<\/script></body></html>`
      : undefined;

  const setSourceByUrl = useCallback(
    async (nextUrl: string, params?: URLSearchParams) => {
      const nextSource = sources.find((source) => source.url === nextUrl);
      if (!nextSource) return;

      const nextSearchParams = params
        ? new URLSearchParams(params)
        : new URLSearchParams(searchParams);
      nextSearchParams.set("type", content.type);
      nextSearchParams.set("source", nextSource.name);
      navigate({ search: nextSearchParams.toString() }, { replace: true });
      setResumePositionSeconds(
        pickResumePositionSeconds(
          content,
          watchState,
          lastSyncedPositionRef.current,
          targetRef.current.season,
          targetRef.current.episode
        )
      );
      setSelectedSourceUrl(nextUrl);
      logProviderInfo({
        contentType: content.type,
        source: nextSource,
        message: "source selected"
      });
    },
    [content, lastSyncedPositionRef, navigate, searchParams, sources, watchState]
  );

  const setDub = useCallback(
    (newIsDub: boolean) => {
      if (newIsDub === isDub) return;
      const params = new URLSearchParams(searchParams);
      setAnimeDubSearchParam(params, newIsDub, prefersDub);
      setSearchParams(params, { replace: true });
      sourceRequestIdRef.current += 1;
      setSources([]);
      setSelectedSourceUrl("");
      setLoading(true);
      setError(null);
    },
    [isDub, prefersDub, searchParams, setSearchParams]
  );

  const goToEpisode = useCallback(
    (next: PlaybackTarget) => {
      targetRef.current = next;
      setTarget(next);
      setResumePositionSeconds(0);
      setCurrentProgress(0);
      lastStoredProgressSampleRef.current = undefined;
      const params = new URLSearchParams(searchParams);
      params.set("type", content.type);
      params.set("season", String(next.season));
      params.set("episode", String(next.episode));
      if (isDub) params.set("dub", "true");
      navigate({ search: params.toString() }, { replace: true });
      sourceRequestIdRef.current += 1;
      setSources([]);
      setSelectedSourceUrl("");
      setLoading(true);
      setError(null);
    },
    [content.type, isDub, navigate, searchParams]
  );

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setSources([]);
    setReloadKey((value) => value + 1);
  }, []);

  const tryNextSource = useCallback(
    (reason = "manual fallback") => {
      if (!selectedSource) return;
      const next = sources.find((source) => source.url !== selectedSource.url);
      if (next) {
        setSelectedSourceUrl(next.url);
        logProviderWarning({
          contentType: content.type,
          source: selectedSource,
          fallbackAttempt: 1,
          message: reason
        });
      }
    },
    [content.type, selectedSource, sources]
  );

  const canTryNextSource = sources.some((source) => source.url !== selectedSourceUrl);

  const reportPlaybackEvent = useCallback(
    ({ event, currentTime, duration, progress, completed }: PlaybackEvent) => {
      const nextProgress = clampProgress(progress ?? calculateProgress(currentTime, duration));
      setCurrentProgress(nextProgress);

      if (playbackSyncInFlightRef.current) return;

      const sample = normalizePlaybackProgressSample({
        event,
        currentTime,
        duration,
        progress: nextProgress
      });
      if (!shouldStorePlaybackProgressSample(lastStoredProgressSampleRef.current, sample)) return;

      playbackSyncInFlightRef.current = true;
      updateProgress(
        content._id,
        nextProgress,
        completed ?? nextProgress >= 95,
        sample.currentTime,
        sample.duration,
        content.type === "tv" ? targetRef.current.season : undefined,
        content.type === "tv" ? targetRef.current.episode : undefined,
        selectedSource?.name,
        animeContent ? isDub : undefined,
        {
          title: content.title,
          type: content.type,
          posterUrl: content.posterUrl ?? "",
          tmdbId: content.tmdbId ?? content._id.split(":").at(-1) ?? "",
          genre: content.genre,
          year: content.year,
          voteAverage: content.voteAverage
        }
      );
      lastSyncedPositionRef.current = sample.currentTime;
      lastStoredProgressSampleRef.current = sample;
      playbackSyncInFlightRef.current = false;
    },
    [animeContent, content, isDub, lastSyncedPositionRef, selectedSource, updateProgress]
  );

  return {
    target,
    loadedTarget,
    sources,
    selectedSource,
    selectedProvider,
    groupedSources,
    loading,
    error,
    isDub,
    showDubToggle,
    resumePositionSeconds,
    embedUrl,
    iframeSrcDoc,
    canTryNextSource,
    currentProgress,
    reportPlaybackEvent,
    setSourceByUrl,
    setDub,
    goToEpisode,
    retry,
    tryNextSource
  };
}
