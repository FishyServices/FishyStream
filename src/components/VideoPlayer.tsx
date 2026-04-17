import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { ArrowLeft, Loader2, AlertCircle, MonitorPlay, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useUser } from "@clerk/react";
import { useWatchProgress } from "@/hooks/useWatchHistory";

interface VideoPlayerProps {
  content: Doc<"content">;
  initialSeason?: number;
  initialEpisode?: number;
}

interface StreamSource {
  name: string;
  url: string;
  quality: string;
  supportsProgressEvents?: boolean;
}

interface PlayerEventPayload {
  type: "PLAYER_EVENT";
  data: {
    event: "timeupdate" | "play" | "pause" | "ended" | "seeked";
    currentTime: number;
    duration: number;
    progress: number;
    id: string;
    mediaType: "movie" | "tv";
    season?: number;
    episode?: number;
    timestamp: number;
  };
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(progress, 100));
}

function normalizeEpisodeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function getEstimatedDurationSeconds(content: Doc<"content">): number {
  const durationText = content.duration?.toLowerCase() ?? "";
  const hours = Number(durationText.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(durationText.match(/(\d+)m/)?.[1] ?? 0);
  const parsedSeconds = hours * 3600 + minutes * 60;
  if (parsedSeconds > 0) return parsedSeconds;
  return content.type === "tv" ? 45 * 60 : 2 * 60 * 60;
}

function buildEmbedUrl(source: StreamSource | undefined): string {
  if (!source) return "";
  try {
    const url = new URL(source.url);
    if (source.supportsProgressEvents) {
      url.searchParams.set("color", "e50914");
    }
    return url.toString();
  } catch {
    return source.url;
  }
}

function parsePlayerMessage(rawData: unknown): PlayerEventPayload | null {
  try {
    const parsed = typeof rawData === "string" ? (JSON.parse(rawData) as unknown) : rawData;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("type" in parsed) ||
      !("data" in parsed) ||
      (parsed as Record<string, unknown>).type !== "PLAYER_EVENT"
    ) {
      return null;
    }
    return parsed as PlayerEventPayload;
  } catch {
    return null;
  }
}

export function VideoPlayer({ content, initialSeason, initialEpisode }: VideoPlayerProps) {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, isSignedIn } = useUser();
  const getMovieSources = useAction(api.providers.getMovieSources);
  const getTVSources = useAction(api.providers.getTVSources);
  const updateProgress = useMutation(api.watchHistory.updateProgress);
  const watchState = useWatchProgress(content._id);

  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const historyInitializedRef = useRef(false);
  const realtimeEventsDetectedRef = useRef(false);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const accumulatedWatchMsRef = useRef(0);
  const startingProgressRef = useRef(0);
  const lastSyncedProgressRef = useRef(0);
  const lastSyncedPositionRef = useRef(0);
  const lastRealtimeSyncAtRef = useRef(0);
  const currentTvTargetRef = useRef({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });
  const loadedTvTargetRef = useRef({ season: 1, episode: 1 });

  const [tvTarget, setTvTarget] = useState({
    season: initialSeason ?? 1,
    episode: initialEpisode ?? 1
  });

  const estimatedDurationSeconds = getEstimatedDurationSeconds(content);
  const selectedSourceConfig = sources.find((s) => s.url === selectedSource);
  const embedUrl = buildEmbedUrl(selectedSourceConfig);

  useEffect(() => {
    setSources([]);
    setSelectedSource("");
    setLoading(true);
    setError(null);
    historyInitializedRef.current = false;
    realtimeEventsDetectedRef.current = false;
    activeSegmentStartedAtRef.current = null;
    accumulatedWatchMsRef.current = 0;
    startingProgressRef.current = 0;
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;
    lastRealtimeSyncAtRef.current = 0;
    const initSeason = initialSeason ?? 1;
    const initEpisode = initialEpisode ?? 1;
    currentTvTargetRef.current = { season: initSeason, episode: initEpisode };
    loadedTvTargetRef.current = { season: initSeason, episode: initEpisode };
    setTvTarget({ season: initSeason, episode: initEpisode });
  }, [content._id, initialSeason, initialEpisode]);

  useEffect(() => {
    if (!isSignedIn || !user || !content._id) return;
    if (watchState === undefined) return;
    if (historyInitializedRef.current) return;

    historyInitializedRef.current = true;
    startingProgressRef.current = clampProgress(watchState.progress);
    lastSyncedProgressRef.current = clampProgress(watchState.progress);
    lastSyncedPositionRef.current = Math.max(0, watchState.positionSeconds);

    if (content.type === "tv") {
      const restoredSeason =
        initialSeason !== undefined
          ? normalizeEpisodeNumber(initialSeason)
          : normalizeEpisodeNumber(watchState.seasonNumber);
      const restoredEpisode =
        initialEpisode !== undefined
          ? normalizeEpisodeNumber(initialEpisode)
          : normalizeEpisodeNumber(watchState.episodeNumber);
      currentTvTargetRef.current = { season: restoredSeason, episode: restoredEpisode };
      setTvTarget({ season: restoredSeason, episode: restoredEpisode });
    }
  }, [content._id, content.type, isSignedIn, user, watchState, initialSeason, initialEpisode]);

  useEffect(() => {
    if (sources.length > 0 || error) return;

    if (isSignedIn && content.type === "tv" && watchState === undefined) return;

    const loadSources = async () => {
      if (!content.imdbId && !content.tmdbId) {
        setError("No video ID available for this content");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const targetSeason = currentTvTargetRef.current.season;
        const targetEpisode = currentTvTargetRef.current.episode;

        const fetchedSources =
          content.type === "tv"
            ? await getTVSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined,
                season: targetSeason,
                episode: targetEpisode
              })
            : await getMovieSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined
              });

        const safeSources = fetchedSources ?? [];
        if (safeSources.length === 0) {
          setError("No streaming sources found for this content");
          setLoading(false);
          return;
        }

        loadedTvTargetRef.current = {
          season: targetSeason,
          episode: targetEpisode
        };
        setSources(safeSources);

        const defaultSource =
          safeSources.find((s) => s.supportsProgressEvents) ?? safeSources[0]!;
        setSelectedSource(defaultSource.url);
      } catch (err) {
        console.error("Error loading sources:", err);
        setError(
          `Failed to load streaming sources: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      } finally {
        setLoading(false);
      }
    };

    void loadSources();
  }, [
    content.imdbId,
    content.tmdbId,
    content.type,
    error,
    getMovieSources,
    getTVSources,
    isSignedIn,
    watchState,
    sources.length
  ]);

  useEffect(() => {
    if (
      !isSignedIn ||
      !user ||
      !content._id ||
      !selectedSourceConfig ||
      selectedSourceConfig.supportsProgressEvents
    ) {
      return;
    }

    let syncInFlight = false;

    const getComputedProgress = () => {
      const activeMs =
        activeSegmentStartedAtRef.current === null
          ? 0
          : Date.now() - activeSegmentStartedAtRef.current;
      const watchedSeconds = (accumulatedWatchMsRef.current + activeMs) / 1000;
      return clampProgress(
        startingProgressRef.current + (watchedSeconds / estimatedDurationSeconds) * 100
      );
    };

    const stopSegment = () => {
      if (activeSegmentStartedAtRef.current === null) return;
      accumulatedWatchMsRef.current += Date.now() - activeSegmentStartedAtRef.current;
      activeSegmentStartedAtRef.current = null;
    };

    const startSegment = () => {
      if (activeSegmentStartedAtRef.current !== null || document.hidden) return;
      activeSegmentStartedAtRef.current = Date.now();
    };

    const syncProgress = (force = false) => {
      if (realtimeEventsDetectedRef.current || syncInFlight) return;
      const next = getComputedProgress();
      if (!force && next - lastSyncedProgressRef.current < 1) return;
      if (next < lastSyncedProgressRef.current) return;

      const estimatedPos = Math.max(
        lastSyncedPositionRef.current,
        Math.round((next / 100) * estimatedDurationSeconds)
      );
      syncInFlight = true;
      void updateProgress({
        clerkUserId: user.id,
        contentId: content._id,
        progress: next,
        completed: next >= 95,
        positionSeconds: estimatedPos,
        durationSeconds: estimatedDurationSeconds,
        seasonNumber: content.type === "tv" ? currentTvTargetRef.current.season : undefined,
        episodeNumber: content.type === "tv" ? currentTvTargetRef.current.episode : undefined
      })
        .then(() => {
          lastSyncedProgressRef.current = next;
          lastSyncedPositionRef.current = estimatedPos;
        })
        .catch((err) => console.error("Fallback progress sync failed:", err))
        .finally(() => {
          syncInFlight = false;
        });
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopSegment();
        syncProgress(true);
      } else {
        startSegment();
      }
    };

    const handlePageHide = () => {
      stopSegment();
      syncProgress(true);
    };

    startSegment();
    const intervalId = window.setInterval(() => syncProgress(), 15_000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      stopSegment();
      syncProgress(true);
    };
  }, [content._id, content.type, estimatedDurationSeconds, isSignedIn, selectedSourceConfig, updateProgress, user]);

  useEffect(() => {
    if (!isSignedIn || !user || !content._id || !selectedSourceConfig || !embedUrl) return;

    let sourceOrigin: string;
    try {
      sourceOrigin = new URL(embedUrl).origin;
    } catch {
      return;
    }

    let syncInFlight = false;

    const syncRealtimeProgress = (data: PlayerEventPayload["data"]) => {
      if (syncInFlight) return;
      const next = clampProgress(data.progress);
      const nextPos = Math.max(0, data.currentTime || 0);
      const nextDur = Math.max(0, data.duration || 0);
      const nextSeason = content.type === "tv" ? normalizeEpisodeNumber(data.season) : undefined;
      const nextEpisode = content.type === "tv" ? normalizeEpisodeNumber(data.episode) : undefined;
      const isForced = data.event !== "timeupdate";
      const isMeaningful =
        Math.abs(nextPos - lastSyncedPositionRef.current) >= 5 ||
        Math.abs(next - lastSyncedProgressRef.current) >= 1 ||
        Date.now() - lastRealtimeSyncAtRef.current >= 15_000;

      if (!isForced && !isMeaningful) return;

      if (
        content.type === "tv" &&
        nextSeason !== undefined &&
        nextEpisode !== undefined &&
        (currentTvTargetRef.current.season !== nextSeason ||
          currentTvTargetRef.current.episode !== nextEpisode)
      ) {
        currentTvTargetRef.current = { season: nextSeason, episode: nextEpisode };
        setTvTarget({ season: nextSeason, episode: nextEpisode });
      }

      realtimeEventsDetectedRef.current = true;
      syncInFlight = true;
      void updateProgress({
        clerkUserId: user.id,
        contentId: content._id,
        progress: next,
        completed: data.event === "ended" || next >= 95,
        positionSeconds: nextPos,
        durationSeconds: nextDur,
        seasonNumber: nextSeason,
        episodeNumber: nextEpisode
      })
        .then(() => {
          lastSyncedProgressRef.current = next;
          lastSyncedPositionRef.current = nextPos;
          lastRealtimeSyncAtRef.current = Date.now();
        })
        .catch((err) => console.error("Realtime progress sync failed:", err))
        .finally(() => {
          syncInFlight = false;
        });
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== sourceOrigin) return;
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return;
      }
      const payload = parsePlayerMessage(event.data);
      if (!payload) return;
      if (payload.data.id !== content.tmdbId) return;
      if (payload.data.mediaType !== content.type) return;
      syncRealtimeProgress(payload.data);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [content._id, content.tmdbId, content.type, embedUrl, isSignedIn, selectedSourceConfig, updateProgress, user]);

  const handleSourceChange = async (nextSourceUrl: string) => {
    const selectedName = sources.find((s) => s.url === nextSourceUrl)?.name;
    const needsEpisodeReload =
      content.type === "tv" &&
      (currentTvTargetRef.current.season !== loadedTvTargetRef.current.season ||
        currentTvTargetRef.current.episode !== loadedTvTargetRef.current.episode);

    realtimeEventsDetectedRef.current = false;

    if (!needsEpisodeReload) {
      setSelectedSource(nextSourceUrl);
      return;
    }

    try {
      setLoading(true);
      const refreshed = await getTVSources({
        imdbId: content.imdbId ?? undefined,
        tmdbId: content.tmdbId ?? undefined,
        season: currentTvTargetRef.current.season,
        episode: currentTvTargetRef.current.episode
      });

      const safe = refreshed ?? [];
      if (safe.length === 0) {
        setError("No sources for this episode");
        return;
      }

      loadedTvTargetRef.current = { ...currentTvTargetRef.current };
      setSources(safe);
      const next =
        safe.find((s) => s.name === selectedName) ??
        safe.find((s) => s.supportsProgressEvents) ??
        safe[0]!;
      setSelectedSource(next.url);
    } catch (err) {
      console.error("Error switching episode sources:", err);
      setError(`Failed to switch sources: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const isWaitingForHistory = isSignedIn && watchState === undefined;

  if (loading || isWaitingForHistory) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/70 text-sm">
            {isWaitingForHistory ? "Loading your watch history..." : "Finding streaming sources..."}
          </p>
        </div>
      </div>
    );
  }

  if (error || sources.length === 0 || !selectedSourceConfig) {
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
      {/* Header bar */}
      <div className="flex-none flex items-center justify-between px-4 py-3 bg-black/90 backdrop-blur-sm border-b border-white/10 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Go back"
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

        <div className="flex items-center gap-2 shrink-0">
          <Select value={selectedSource} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-[160px] sm:w-[220px] bg-white/10 border-white/20 text-white text-sm">
              <MonitorPlay className="w-4 h-4 mr-1.5 shrink-0" />
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-black border-white/20">
              {sources.map((source) => (
                <SelectItem
                  key={source.url}
                  value={source.url}
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  {source.name}
                  {source.supportsProgressEvents ? " ✓" : ""} ({source.quality})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Player */}
      <div className="flex-1 relative bg-black">
        <iframe
          ref={iframeRef}
          key={embedUrl}
          src={embedUrl}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          title={`Playing ${content.title}`}
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
