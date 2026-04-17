import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { ArrowLeft, Loader2, AlertCircle, MonitorPlay } from "lucide-react";
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

function getEstimatedDurationSeconds(content: Doc<"content">): number {
  const durationText = content.duration?.toLowerCase() ?? "";
  const hours = Number(durationText.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(durationText.match(/(\d+)m/)?.[1] ?? 0);
  const parsedSeconds = hours * 3600 + minutes * 60;

  if (parsedSeconds > 0) return parsedSeconds;

  return content.type === "tv" ? 45 * 60 : 2 * 60 * 60;
}

function buildEmbedUrl(
  source: StreamSource | undefined,
  resumePositionSeconds: number,
  completed: boolean,
  durationSeconds: number,
  contentType: Doc<"content">["type"]
): string {
  if (!source) return "";

  const url = new URL(source.url);
  if (!source.supportsProgressEvents) {
    return url.toString();
  }

  url.searchParams.set("color", "e50914");

  if (contentType === "tv") {
    url.searchParams.set("nextEpisode", "true");
    url.searchParams.set("episodeSelector", "true");
  }

  return url.toString();
}

function parsePlayerMessage(rawData: unknown): PlayerEventPayload | null {
  try {
    const parsed =
      typeof rawData === "string" ? (JSON.parse(rawData) as unknown) : rawData;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("type" in parsed) ||
      !("data" in parsed) ||
      parsed.type !== "PLAYER_EVENT"
    ) {
      return null;
    }

    return parsed as PlayerEventPayload;
  } catch {
    return null;
  }
}

export function VideoPlayer({ content }: VideoPlayerProps) {
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
  const [historyReady, setHistoryReady] = useState(false);
  const [resumeSeed, setResumeSeed] = useState({
    positionSeconds: 0,
    completed: false,
    durationSeconds: 0
  });
  const historyInitializedRef = useRef(false);
  const realtimeEventsDetectedRef = useRef(false);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const accumulatedWatchMsRef = useRef(0);
  const startingProgressRef = useRef(0);
  const lastSyncedProgressRef = useRef(0);
  const lastSyncedPositionRef = useRef(0);
  const lastRealtimeSyncAtRef = useRef(0);
  const estimatedDurationSeconds = getEstimatedDurationSeconds(content);
  const selectedSourceConfig = sources.find((source) => source.url === selectedSource);
  const embedUrl = buildEmbedUrl(
    selectedSourceConfig,
    resumeSeed.positionSeconds,
    resumeSeed.completed,
    resumeSeed.durationSeconds,
    content.type
  );

  const stopActiveSegment = () => {
    if (activeSegmentStartedAtRef.current === null) return;

    accumulatedWatchMsRef.current += Date.now() - activeSegmentStartedAtRef.current;
    activeSegmentStartedAtRef.current = null;
  };

  const startActiveSegment = () => {
    if (activeSegmentStartedAtRef.current !== null || document.hidden) return;
    activeSegmentStartedAtRef.current = Date.now();
  };

  const getComputedProgress = () => {
    const activeSegmentMs =
      activeSegmentStartedAtRef.current === null
        ? 0
        : Date.now() - activeSegmentStartedAtRef.current;
    const watchedSeconds = (accumulatedWatchMsRef.current + activeSegmentMs) / 1000;

    return clampProgress(
      startingProgressRef.current + (watchedSeconds / estimatedDurationSeconds) * 100
    );
  };

  useEffect(() => {
    setSources([]);
    setSelectedSource("");
    setLoading(true);
    setError(null);
    setHistoryReady(false);
    setResumeSeed({
      positionSeconds: 0,
      completed: false,
      durationSeconds: 0
    });
    historyInitializedRef.current = false;
    realtimeEventsDetectedRef.current = false;
    activeSegmentStartedAtRef.current = null;
    accumulatedWatchMsRef.current = 0;
    startingProgressRef.current = 0;
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;
    lastRealtimeSyncAtRef.current = 0;
  }, [content._id]);

  useEffect(() => {
    if (sources.length > 0 || error) return;

    const loadSources = async () => {
      if (!content.imdbId && !content.tmdbId) {
        setError("No video ID available for this content");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const fetchedSources =
          content.type === "tv"
            ? await getTVSources({
                imdbId: content.imdbId || undefined,
                tmdbId: content.tmdbId || undefined,
                season: 1,
                episode: 1
              })
            : await getMovieSources({
                imdbId: content.imdbId || undefined,
                tmdbId: content.tmdbId || undefined
              });

        const safeSources = fetchedSources ?? [];
        setSources(safeSources);

        if (safeSources.length === 0) {
          setError("No streaming sources found for this content");
          return;
        }

        const defaultSource =
          safeSources.find((source) => source.supportsProgressEvents) ?? safeSources[0]!;
        setSelectedSource(defaultSource.url);
      } catch (loadError) {
        console.error("Error loading sources:", loadError);
        setError(
          `Failed to load streaming sources: ${
            loadError instanceof Error ? loadError.message : "Unknown error"
          }`
        );
      } finally {
        setLoading(false);
      }
    };

    void loadSources();
  }, [content.imdbId, content.tmdbId, content.type, error, getMovieSources, getTVSources, sources.length]);

  useEffect(() => {
    if (!isSignedIn || !user || !content._id) return;
    if (watchState === undefined || historyInitializedRef.current) return;

    historyInitializedRef.current = true;
    startingProgressRef.current = clampProgress(watchState.progress);
    lastSyncedProgressRef.current = clampProgress(watchState.progress);
    lastSyncedPositionRef.current = Math.max(0, watchState.positionSeconds);
    setHistoryReady(true);
    setResumeSeed({
      positionSeconds: Math.max(0, watchState.positionSeconds),
      completed: watchState.completed,
      durationSeconds: Math.max(0, watchState.durationSeconds)
    });

    void updateProgress({
      clerkUserId: user.id,
      contentId: content._id,
      progress: clampProgress(watchState.progress),
      completed: watchState.completed,
      positionSeconds: Math.max(0, watchState.positionSeconds),
      durationSeconds: Math.max(0, watchState.durationSeconds)
    }).catch((progressError) => {
      console.error("Failed to initialize watch history:", progressError);
    });
  }, [content._id, isSignedIn, updateProgress, user, watchState]);

  useEffect(() => {
    if (
      !isSignedIn ||
      !user ||
      !content._id ||
      !historyReady ||
      !selectedSourceConfig ||
      selectedSourceConfig.supportsProgressEvents
    ) {
      return;
    }

    let syncInFlight = false;

    const syncProgress = (force = false) => {
      if (realtimeEventsDetectedRef.current) return;
      if (syncInFlight) return;

      const nextProgress = getComputedProgress();
      if (!force && nextProgress - lastSyncedProgressRef.current < 1) return;
      if (nextProgress < lastSyncedProgressRef.current) return;

      const estimatedPositionSeconds = Math.max(
        lastSyncedPositionRef.current,
        Math.round((nextProgress / 100) * estimatedDurationSeconds)
      );

      syncInFlight = true;
      void updateProgress({
        clerkUserId: user.id,
        contentId: content._id,
        progress: nextProgress,
        completed: nextProgress >= 95,
        positionSeconds: estimatedPositionSeconds,
        durationSeconds: estimatedDurationSeconds
      })
        .then(() => {
          lastSyncedProgressRef.current = nextProgress;
          lastSyncedPositionRef.current = estimatedPositionSeconds;
        })
        .catch((progressError) => {
          console.error("Failed to sync fallback watch progress:", progressError);
        })
        .finally(() => {
          syncInFlight = false;
        });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopActiveSegment();
        syncProgress(true);
        return;
      }

      startActiveSegment();
    };

    const handlePageHide = () => {
      stopActiveSegment();
      syncProgress(true);
    };

    startActiveSegment();

    const intervalId = window.setInterval(() => {
      syncProgress();
    }, 15000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      stopActiveSegment();
      syncProgress(true);
    };
  }, [content._id, estimatedDurationSeconds, historyReady, isSignedIn, selectedSourceConfig, updateProgress, user]);

  useEffect(() => {
    if (
      !isSignedIn ||
      !user ||
      !content._id ||
      !historyReady ||
      !selectedSourceConfig ||
      !embedUrl
    ) {
      return;
    }

    const sourceOrigin = new URL(embedUrl).origin;
    let syncInFlight = false;

    const syncRealtimeProgress = (payload: PlayerEventPayload["data"]) => {
      if (syncInFlight) return;

      const nextProgress = clampProgress(payload.progress);
      const nextPositionSeconds = Math.max(0, payload.currentTime || 0);
      const nextDurationSeconds = Math.max(0, payload.duration || 0);
      const isForcedEvent = payload.event !== "timeupdate";
      const isMeaningfulDelta =
        Math.abs(nextPositionSeconds - lastSyncedPositionRef.current) >= 5 ||
        Math.abs(nextProgress - lastSyncedProgressRef.current) >= 1 ||
        Date.now() - lastRealtimeSyncAtRef.current >= 15000;

      if (!isForcedEvent && !isMeaningfulDelta) return;

      syncInFlight = true;
      realtimeEventsDetectedRef.current = true;
      void updateProgress({
        clerkUserId: user.id,
        contentId: content._id,
        progress: nextProgress,
        completed: payload.event === "ended" || nextProgress >= 95,
        positionSeconds: nextPositionSeconds,
        durationSeconds: nextDurationSeconds
      })
        .then(() => {
          lastSyncedProgressRef.current = nextProgress;
          lastSyncedPositionRef.current = nextPositionSeconds;
          lastRealtimeSyncAtRef.current = Date.now();
        })
        .catch((progressError) => {
          console.error("Failed to sync VidKing progress:", progressError);
        })
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
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [content._id, content.tmdbId, content.type, embedUrl, historyReady, isSignedIn, selectedSourceConfig, updateProgress, user]);

  const handleSourceChange = (nextSource: string) => {
    realtimeEventsDetectedRef.current = false;
    setResumeSeed({
      positionSeconds: lastSyncedPositionRef.current,
      completed: lastSyncedProgressRef.current >= 95,
      durationSeconds:
        watchState?.durationSeconds && watchState.durationSeconds > 0
          ? watchState.durationSeconds
          : estimatedDurationSeconds
    });
    setSelectedSource(nextSource);
  };

  if (loading || (isSignedIn && watchState === undefined)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/80">Finding best streaming source...</p>
        </div>
      </div>
    );
  }

  if (error || sources.length === 0 || !selectedSourceConfig) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Sources Available</h2>
          <p className="text-white/60 mb-6">
            {error || "Could not find any streaming sources for this content."}
          </p>
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      <div className="flex-none flex items-center justify-between p-4 bg-black/90 backdrop-blur-sm border-b border-white/10 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-white">{content.title}</h1>
            <p className="text-sm text-white/60">
              {content.type === "movie" ? "Movie" : "TV Series"} • {content.year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedSource} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-[220px] bg-white/10 border-white/20 text-white">
              <MonitorPlay className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-black border-white/20">
              {sources.map((source) => (
                <SelectItem
                  key={source.url}
                  value={source.url}
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  {source.name}
                  {source.supportsProgressEvents ? " • Live Progress" : ""} ({source.quality})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 relative bg-black">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          title="Video Player"
        />
      </div>
    </div>
  );
}
