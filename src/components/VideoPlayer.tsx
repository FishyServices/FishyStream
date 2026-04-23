import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { ArrowLeft, Loader2, AlertCircle, MonitorPlay, RefreshCw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useUser } from "@clerk/react";
import { useGetProgress, useUpdateProgress } from "@/hooks/useWatchProgress";
import type { PlayerEventPayload, MediaDataPayload, PlayerControls } from "@/lib/playerProviders";
import {
  parsePlayerMessage,
  calculateProgress,
  isVidFastOrigin,
  isVideasyOrigin,
  createPlayerControls
} from "@/lib/playerProviders";

interface VideoPlayerProps {
  content: Doc<"content">;
  initialSeason?: number;
  initialEpisode?: number;
  initialSource?: string;
}

interface StreamSource {
  name: string;
  url: string;
  quality: string;
  supportsProgressEvents?: boolean;
}

function clamp(v: number) {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

function safeEp(v: number | null | undefined) {
  return v != null && Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1;
}

function estimateDuration(content: Doc<"content">) {
  const txt = content.duration?.toLowerCase() ?? "";
  const h = Number(txt.match(/(\d+)h/)?.[1] ?? 0);
  const m = Number(txt.match(/(\d+)m/)?.[1] ?? 0);
  const s = h * 3600 + m * 60;
  return s > 0 ? s : content.type === "tv" ? 45 * 60 : 2 * 60 * 60;
}

export function VideoPlayer({
  content,
  initialSeason,
  initialEpisode,
  initialSource
}: VideoPlayerProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, isSignedIn } = useUser();

  const getMovieSources = useAction(api.providers.getMovieSources);
  const getTVSources = useAction(api.providers.getTVSources);
  const updateProgress = useUpdateProgress();
  const watchState = useGetProgress(content._id);

  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);

  const historyInitRef = useRef(false);
  const realtimeDetectedRef = useRef(false);
  const lastSyncedProgressRef = useRef(0);
  const lastSyncedPositionRef = useRef(0);
  const lastRealtimeSyncAtRef = useRef(0);

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
    api.seasons.getSeason,
    content.type === "tv" ? { contentId: content._id, seasonNumber: tvTarget.season } : "skip"
  );

  useEffect(() => {
    setSources([]);
    setSelectedSource("");
    setLoading(true);
    setError(null);
    historyInitRef.current = false;
    realtimeDetectedRef.current = false;
    lastSyncedProgressRef.current = 0;
    lastSyncedPositionRef.current = 0;
    lastRealtimeSyncAtRef.current = 0;
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
      tvTargetRef.current = { season: s, episode: e };
      loadedTvRef.current = { season: s, episode: e };
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
        }
      }
    }
  }, [content._id, content.type, watchState, initialSeason, initialEpisode]);

  useEffect(() => {
    if (sources.length > 0 || error) return;

    const load = async () => {
      if (!content.imdbId && !content.tmdbId) {
        setError("No video ID available for this content");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { season, episode } = tvTargetRef.current;
        const fetched =
          content.type === "tv"
            ? await getTVSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined,
                season,
                episode
              })
            : await getMovieSources({
                imdbId: content.imdbId ?? undefined,
                tmdbId: content.tmdbId ?? undefined
              });

        if (!fetched?.length) {
          setError("No streaming sources found for this content");
          setLoading(false);
          return;
        }

        loadedTvRef.current = { season, episode };
        setSources(fetched);
        const preferredSource = initialSource
          ? fetched.find((s) => s.name.toLowerCase() === initialSource.toLowerCase())
          : undefined;
        const def = preferredSource ?? fetched.find((s) => s.supportsProgressEvents) ?? fetched[0]!;
        setSelectedSource(def.url);
      } catch (err) {
        setError(
          `Failed to load streaming sources: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [content._id, sources.length, error, initialSource]);

  const selectedSourceConfig = sources.find((s) => s.url === selectedSource);
  const isVidFast = selectedSourceConfig?.name === "VidFast";

  const embedUrl = (() => {
    if (!selectedSourceConfig) return "";
    try {
      const url = new URL(selectedSourceConfig.url);
      if (selectedSourceConfig.supportsProgressEvents && !isVidFast) {
        url.searchParams.set("color", "e50914");
      }
      if (isVidFast && content.type === "tv") {
        url.searchParams.set("nextButton", "true");
      }
      return url.toString();
    } catch {
      return selectedSourceConfig.url;
    }
  })();

  const playerControls: PlayerControls = createPlayerControls(iframeRef);

  useEffect(() => {
    if (!embedUrl) return;

    let origin: string;
    try {
      origin = new URL(embedUrl).origin;
    } catch {
      return;
    }

    let syncInFlight = false;

    const handleMsg = (event: MessageEvent) => {
      const isVidFast = isVidFastOrigin(event.origin);
      const isVideasy = isVideasyOrigin(event.origin);

      if (!isVidFast && !isVideasy && event.origin !== origin) return;

      if (!isVidFast && !isVideasy) {
        if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow)
          return;
      }

      const payload = parsePlayerMessage(event.data, event.origin);

      if (!payload) return;

      if (payload.type === "MEDIA_DATA" && isVidFast) {
        return;
      }

      const { data } = payload as PlayerEventPayload;

      const eventTmdbId = data.tmdbId !== undefined ? String(data.tmdbId) : data.id;
      if (eventTmdbId !== undefined && eventTmdbId !== content.tmdbId) return;
      if (data.mediaType && data.mediaType !== content.type) return;

      const nextPos = Math.max(0, data.currentTime || 0);
      const nextDur = Math.max(0, data.duration || 0);
      const nextProgress =
        data.progress !== undefined ? clamp(data.progress) : calculateProgress(nextPos, nextDur);

      setCurrentProgress(nextProgress);

      if (!isSignedIn || !user) return;
      if (syncInFlight) return;

      const isForced = data.event !== "timeupdate";
      const meaningful =
        Math.abs(nextPos - lastSyncedPositionRef.current) >= 10 ||
        Math.abs(nextProgress - lastSyncedProgressRef.current) >= 2 ||
        Date.now() - lastRealtimeSyncAtRef.current >= 60_000;

      if (!isForced && !meaningful) return;

      const nextSeason =
        content.type === "tv" && data.season != null && Number.isFinite(data.season)
          ? Math.max(1, Math.floor(data.season))
          : undefined;
      const nextEpisode =
        content.type === "tv" && data.episode != null && Number.isFinite(data.episode)
          ? Math.max(1, Math.floor(data.episode))
          : undefined;

      if (
        nextSeason !== undefined &&
        nextEpisode !== undefined &&
        (tvTargetRef.current.season !== nextSeason || tvTargetRef.current.episode !== nextEpisode)
      ) {
        tvTargetRef.current = { season: nextSeason, episode: nextEpisode };
        setTvTarget({ season: nextSeason, episode: nextEpisode });
      }

      realtimeDetectedRef.current = true;
      syncInFlight = true;

      updateProgress(
        content._id,
        nextProgress,
        data.event === "ended" || nextProgress >= 95,
        nextPos,
        nextDur,
        nextSeason,
        nextEpisode
      )?.finally(() => {
        lastSyncedProgressRef.current = nextProgress;
        lastSyncedPositionRef.current = nextPos;
        lastRealtimeSyncAtRef.current = Date.now();
        syncInFlight = false;
      });
    };

    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, [content._id, content.tmdbId, content.type, embedUrl, isSignedIn, user, updateProgress]);

  const handleSourceChange = async (nextUrl: string) => {
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
      setSelectedSource(nextUrl);
      return;
    }

    try {
      setLoading(true);
      const refreshed = await getTVSources({
        imdbId: content.imdbId ?? undefined,
        tmdbId: content.tmdbId ?? undefined,
        season: tvTargetRef.current.season,
        episode: tvTargetRef.current.episode
      });

      if (!refreshed?.length) {
        setError("No sources for this episode");
        return;
      }

      loadedTvRef.current = { ...tvTargetRef.current };
      setSources(refreshed);
      const next =
        refreshed.find((s) => s.name === prevName) ??
        refreshed.find((s) => s.supportsProgressEvents) ??
        refreshed[0]!;
      setSelectedSource(next.url);
    } catch (err) {
      setError(`Failed to switch sources: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNextEpisode = () => {
    if (content.type !== "tv") return;

    const currentSeason = tvTargetRef.current.season;
    const currentEpisode = tvTargetRef.current.episode;
    const totalSeasons = content.seasons ?? 1;

    const maxEpisodes =
      currentSeasonData?.episodeCount ?? currentSeasonData?.episodes?.length ?? 999;

    let nextSeason = currentSeason;
    let nextEpisode = currentEpisode + 1;

    if (currentEpisode >= maxEpisodes) {
      nextSeason = currentSeason + 1;
      nextEpisode = 1;
    }

    if (nextSeason > totalSeasons) {
      return;
    }

    tvTargetRef.current = { season: nextSeason, episode: nextEpisode };
    setTvTarget({ season: nextSeason, episode: nextEpisode });

    const params = new URLSearchParams();
    params.set("season", String(nextSeason));
    params.set("episode", String(nextEpisode));
    const currentSource = searchParams.get("source");
    if (currentSource) {
      params.set("source", currentSource);
    }
    navigate({ search: params.toString() }, { replace: true });

    setSources([]);
    setLoading(true);
    setError(null);
  };

  const hasNextEpisode = (() => {
    if (content.type !== "tv") return false;
    const totalSeasons = content.seasons ?? 1;
    if (tvTarget.season < totalSeasons) return true;
    const seasonEpisodeCount =
      currentSeasonData?.episodeCount ?? currentSeasonData?.episodes?.length;
    if (seasonEpisodeCount == null) return false;
    return tvTarget.episode < seasonEpisodeCount;
  })();

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

        <Select value={selectedSource} onValueChange={handleSourceChange}>
          <SelectTrigger className="w-full sm:w-[220px] bg-white/10 border-white/20 text-white text-sm">
            <MonitorPlay className="w-4 h-4 mr-1.5 shrink-0" />
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-black border-white/20">
            {sources.map((s) => (
              <SelectItem
                key={s.url}
                value={s.url}
                className="text-white focus:bg-white/10 focus:text-white"
              >
                {s.name}
                {s.supportsProgressEvents ? " ✓" : ""} ({s.quality})
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

        {/* Next Episode Button - Bottom Right, shows at 80% progress */}
        {content.type === "tv" && hasNextEpisode && currentProgress >= 80 && (
          <Button
            onClick={handleNextEpisode}
            className="absolute bottom-4 left-4 right-4 gap-2 bg-black/70 border border-white/20 text-white hover:bg-black/90 backdrop-blur-sm sm:left-auto"
          >
            <SkipForward className="w-4 h-4" />
            Next Episode
          </Button>
        )}
      </div>
    </div>
  );
}
