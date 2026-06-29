import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction, URLSearchParamsInit } from "react-router-dom";
import { createProviderEmbedUrl, type ProviderContentType } from "@fishy/providers/playerProviders";
import {
  buildMovieSources,
  buildTvSources,
  getProviderByKey,
  type ProviderCatalogEntry,
  type StreamSource
} from "@fishy/providers/providerCatalog";
import {
  getSeasonYear,
  groupSourcesByProviderCategory,
  isAnimeProviderContent,
  pickPreferredSource
} from "@fishy/providers/providerPlayback";
import type { ProviderGroupedSources } from "@fishy/providers/providerPlayback";
import type { AppSettings } from "@/lib/appSettings";
import { logProviderInfo, logProviderWarning } from "./providerDiagnostics";
import type { ContentPlayback } from "../../shared/contentMetadata";
import type { ProgressState } from "@/hooks/useWatchProgress";

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
  setSourceByUrl(url: string): Promise<void>;
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
  lastSyncedPositionRef
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
  const isDub = searchParams.get("dub") === "true";
  const prefersDub = settings.defaultAnimeLanguage === "dub";

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
  }, [initialSeason, initialEpisode]);

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
            ? await buildTvSources({
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
                year: getSeasonYear(targetSeasonData?.airDate) ?? content.year,
                season,
                episode,
                dub: animeContent ? isDub || (!searchParams.has("dub") && prefersDub) : undefined
              })
            : buildMovieSources({
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
          pickPreferredSource(fetched, {
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
  const selectedProvider = selectedSource ? getProviderByKey(selectedSource.key) : undefined;
  const groupedSources = useMemo(() => groupSourcesByProviderCategory(sources), [sources]);
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
    async (nextUrl: string) => {
      const nextSource = sources.find((source) => source.url === nextUrl);
      if (!nextSource) return;

      const params = new URLSearchParams(searchParams);
      params.set("type", content.type);
      params.set("source", nextSource.name);
      navigate({ search: params.toString() }, { replace: true });
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
      if (newIsDub) params.set("dub", "true");
      else params.delete("dub");
      setSearchParams(params, { replace: true });
      sourceRequestIdRef.current += 1;
      setSources([]);
      setSelectedSourceUrl("");
      setLoading(true);
      setError(null);
    },
    [isDub, searchParams, setSearchParams]
  );

  const goToEpisode = useCallback(
    (next: PlaybackTarget) => {
      targetRef.current = next;
      setTarget(next);
      setResumePositionSeconds(0);
      const params = new URLSearchParams();
      params.set("type", content.type);
      params.set("season", String(next.season));
      params.set("episode", String(next.episode));
      const currentSource = searchParams.get("source");
      if (currentSource) params.set("source", currentSource);
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
    setSourceByUrl,
    setDub,
    goToEpisode,
    retry,
    tryNextSource
  };
}
