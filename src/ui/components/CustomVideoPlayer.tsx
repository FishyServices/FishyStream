import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Info,
  Mic2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Download
} from "lucide-react";
import { Button } from "@fishy/ui";
import {
  ProviderSourceSelect,
  type ProviderIdType,
  type ProviderUiMode
} from "@/ui/components/ProviderSourceSelect";
import type { ContentPlayback } from "@content/contentMetadata";
import type { PlaybackEvent } from "@/features/playback/usePlaybackSession";
import { useVideoDownloads } from "@/ui/components/custom-video-player/downloads";

interface CustomVideoPlayerProps {
  embedUrl: string;
  localFile?: File;
  content: ContentPlayback;
  tvTarget: { season: number; episode: number };
  getEpisodeEmbedUrl?: (target: { season: number; episode: number }) => Promise<string | null>;
  onOpenEpisodePicker?: () => void;
  downloadRequest?: { season: number; episodes: number[] } | null;
  onDownloadRequestConsumed?: () => void;
  animeContent: boolean;
  isDub: boolean;
  onPlaybackEvent: (event: PlaybackEvent) => void;
  showDubToggle: boolean;
  handleDubToggle: (isDub: boolean) => void;
  selectedSource: string;
  onSelectProvider: (nextUrl: string, mode: ProviderUiMode) => void;
  providerIdType: ProviderIdType;
  onProviderIdTypeChange: (idType: ProviderIdType) => void;
  groupedSources: any[];
  onInfoClick: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CustomVideoPlayer({
  embedUrl,
  localFile,
  content,
  tvTarget,
  getEpisodeEmbedUrl,
  onOpenEpisodePicker,
  downloadRequest,
  onDownloadRequestConsumed,
  animeContent,
  isDub,
  onPlaybackEvent,
  showDubToggle,
  handleDubToggle,
  selectedSource,
  onSelectProvider,
  providerIdType,
  onProviderIdTypeChange,
  groupedSources,
  onInfoClick
}: CustomVideoPlayerProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [subtitles, setSubtitles] = useState<any[]>([]);
  const [skipTimes, setSkipTimes] = useState<{
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  }>({});

  const [isScraping, setIsScraping] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(isPlaying);

  const {
    downloadUrl,
    downloadState,
    batchDownloadState,
    downloadProgress,
    batchDownloadProgress,
    selectedBatchEpisodes,
    setSelectedBatchEpisodes,
    prepareDownload,
    resetDownload,
    handleDownload,
    handleBatchDownload
  } = useVideoDownloads({
    contentId: content._id,
    contentTitle: content.title,
    contentType: content.type,
    tvTarget,
    selectedSource,
    localFile,
    downloadReady: !isScraping,
    getEpisodeEmbedUrl,
    downloadRequest,
    onDownloadRequestConsumed
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        setShowControls(false);
        setShowSettings(false);
      }
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "SELECT" ||
        activeElement?.tagName === "BUTTON" ||
        activeElement?.isContentEditable
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (e.code === "Space" || e.code === "KeyK") {
        e.preventDefault();
        togglePlay();
        triggerControls();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        handleVolumeChange(Math.min(1, video.volume + 0.05));
        triggerControls();
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        handleVolumeChange(Math.max(0, video.volume - 0.05));
        triggerControls();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(Math.max(0, video.currentTime - 5));
        triggerControls();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(Math.min(video.duration || Infinity, video.currentTime + 5));
        triggerControls();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
        triggerControls();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
        triggerControls();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!embedUrl && !localFile) return;

    let isMounted = true;
    const abortController = new AbortController();
    let localObjectUrl: string | null = null;
    setIsScraping(true);
    setMediaError(null);
    resetDownload();

    const loadVideoSource = (sourceUrl: string, mediaType: "hls" | "file", startAtSeconds = 0) => {
      const video = videoRef.current;
      if (!video || !isMounted) return;

      if (mediaType === "hls" && Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (startAtSeconds > 0) video.currentTime = startAtSeconds;
          video.play().catch(() => {});
        });
        return;
      }

      video.src = sourceUrl;
      video.load();
      if (startAtSeconds > 0) {
        const handleLoaded = () => {
          video.currentTime = startAtSeconds;
          video.removeEventListener("loadedmetadata", handleLoaded);
          video.play().catch(() => {});
        };
        video.addEventListener("loadedmetadata", handleLoaded);
      } else {
        video.play().catch(() => {});
      }
    };

    const fetchRawStream = async () => {
      try {
        if (localFile) {
          localObjectUrl = URL.createObjectURL(localFile);
          prepareDownload({ url: localObjectUrl, mode: "file", persist: false });
          loadVideoSource(localObjectUrl, "file");
          return;
        }

        const scraperEndpoint = import.meta.env.DEV
          ? "http://localhost:4000/api/scrape"
          : "/api/scrape";
        const res = await fetch(`${scraperEndpoint}?url=${encodeURIComponent(embedUrl)}`, {
          signal: abortController.signal
        });
        if (!res.ok) throw new Error("Unable to load the stream.");
        const data = await res.json();
        if (!isMounted) return;

        if (data.streamUrl && videoRef.current) {
          hlsRef.current?.destroy();
          hlsRef.current = null;

          if (data.tracks) setSubtitles(data.tracks);
          if (data.intro || data.outro) setSkipTimes({ intro: data.intro, outro: data.outro });

          const mediaType =
            data.mediaType ?? (String(data.streamUrl).includes(".m3u8") ? "hls" : "file");

          if (mediaType === "file" && typeof data.streamUrl === "string") {
            const downloadUrl = new URL(data.streamUrl, window.location.origin);
            const filename = `${content.title}${content.type === "tv" ? ` - S${tvTarget.season}E${tvTarget.episode}` : ""}.mp4`;
            downloadUrl.searchParams.set("download", "1");
            downloadUrl.searchParams.set("filename", filename);
            prepareDownload({ url: downloadUrl.href, mode: "file", persist: true });
          } else if (mediaType === "hls" && typeof data.streamUrl === "string") {
            prepareDownload({ url: data.streamUrl, mode: "hls", persist: true });
          }

          const getStartAtSeconds = () => {
            try {
              const url = new URL(embedUrl);
              const startAt = url.searchParams.get("startAt") || url.searchParams.get("progress");
              if (startAt) {
                const secs = Number(startAt);
                if (Number.isFinite(secs) && secs > 0) return secs;
              }
            } catch {}
            return 0;
          };

          const startAtSeconds = getStartAtSeconds();

          if (mediaType === "hls" && !Hls.isSupported()) {
            const video = videoRef.current;
            if (video.canPlayType("application/vnd.apple.mpegurl")) {
              loadVideoSource(data.streamUrl, mediaType, startAtSeconds);
            }
          } else {
            loadVideoSource(data.streamUrl, mediaType, startAtSeconds);
          }
        }
      } catch (error) {
        if (isMounted && !abortController.signal.aborted) {
          setMediaError(error instanceof Error ? error.message : "Unable to load this video.");
        }
      } finally {
        if (isMounted) {
          setIsScraping(false);
        }
      }
    };

    fetchRawStream();
    return () => {
      isMounted = false;
      abortController.abort();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [embedUrl, localFile]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handlePlayState = () => {
      setIsPlaying(!video.paused);
    };
    const handleVolumeState = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleDurationChange = () => {
      if (Number.isFinite(video.duration) && video.duration >= 0) {
        setDuration(video.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (!video || !video.duration) return;

      const curr = video.currentTime;
      const dur = video.duration;
      setCurrentTime(curr);
      onPlaybackEvent({
        event: "timeupdate",
        currentTime: curr,
        duration: dur,
        completed: video.ended
      });
    };

    video.addEventListener("play", handlePlayState);
    video.addEventListener("pause", handlePlayState);
    video.addEventListener("volumechange", handleVolumeState);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("loadedmetadata", handleDurationChange);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handlePlayState);

    return () => {
      video.removeEventListener("play", handlePlayState);
      video.removeEventListener("pause", handlePlayState);
      video.removeEventListener("volumechange", handleVolumeState);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("loadedmetadata", handleDurationChange);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handlePlayState);
    };
  }, [isScraping, onPlaybackEvent]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSeek = (value: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const handleVolumeChange = (value: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = value;
    setVolume(value);
    if (value > 0 && videoRef.current.muted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    setIsMuted(nextMute);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Fullscreen Request Failed:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const isIntro =
    skipTimes.intro && currentTime >= skipTimes.intro.start && currentTime <= skipTimes.intro.end;
  const isOutro =
    skipTimes.outro && currentTime >= skipTimes.outro.start && currentTime <= skipTimes.outro.end;

  const markerPosition = (seconds: number) =>
    duration > 0 ? `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%` : "0%";

  const handleMediaError = () => {
    if (!localFile) return;
    const isMkv = /\.mkv$/i.test(localFile.name);
    setMediaError(
      isMkv
        ? "This browser cannot decode MKV files here. Convert it to MP4 (H.264/AAC) or WebM, then try again."
        : "This video could not be decoded by your browser. Try MP4 (H.264/AAC) or WebM."
    );
  };

  const showEpisodePicker = content.type === "tv" && !!onOpenEpisodePicker;

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="group/custom-player relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-black ring-1 ring-white/10"
    >
      <video
        ref={videoRef}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onError={handleMediaError}
        className={`w-full h-full object-contain ${showControls ? "cursor-pointer" : "cursor-none"}`}
        autoPlay
        playsInline
      >
        {subtitles.map((track, i) => (
          <track
            key={i}
            kind={track.kind}
            src={track.file}
            srcLang={track.label?.substring(0, 2).toLowerCase() || "en"}
            label={track.label}
            default={track.default}
          />
        ))}
      </video>

      <div
        className={`absolute inset-0 z-30 flex flex-col justify-between bg-linear-to-t from-black/80 via-transparent to-black/15 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex w-full items-start justify-between gap-4 px-3 pt-3 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="touch-target h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-black/25 text-white backdrop-blur-md hover:bg-white/15"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white sm:text-base">
                {content.title}
              </p>
              <p className="eyebrow mt-1 text-white/55">
                {content.type === "tv"
                  ? `Season ${tvTarget.season} · Episode ${tvTarget.episode}`
                  : "Movie"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onInfoClick}
            aria-label="Show details"
            className="touch-target h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-black/25 text-white backdrop-blur-md hover:bg-white/15"
          >
            <Info className="h-5 w-5" />
          </Button>
        </div>

        {!isPlaying && !isScraping && !mediaError && (
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/25 transition-transform hover:scale-105 hover:bg-primary"
            aria-label="Play"
          >
            <Play className="ml-1 h-9 w-9 fill-current stroke-current" />
          </Button>
        )}

        <div
          className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-2xl border border-white/10 bg-black/45 px-3 pb-2 pt-1 shadow-2xl shadow-black/30 backdrop-blur-xl sm:mx-4 sm:mb-4 sm:w-[calc(100%-2rem)] sm:px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="group/scrubber relative mb-1 h-8 w-full">
            <div className="pointer-events-none absolute inset-x-0 top-3.5 h-1.5 rounded-full bg-white/20" />
            <div
              className="pointer-events-none absolute left-0 top-3.5 h-1.5 rounded-full bg-primary shadow-[0_0_12px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
              style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
            />
            {skipTimes.intro && duration > 0 && (
              <div
                className="pointer-events-none absolute top-3.5 z-10 h-1.5 rounded-full bg-warning/80"
                style={{
                  left: markerPosition(skipTimes.intro.start),
                  width: `${Math.max(0, ((skipTimes.intro.end - skipTimes.intro.start) / duration) * 100)}%`
                }}
                title="Intro"
              />
            )}
            {skipTimes.outro && duration > 0 && (
              <div
                className="pointer-events-none absolute top-3.5 z-10 h-1.5 rounded-full bg-destructive/80"
                style={{
                  left: markerPosition(skipTimes.outro.start),
                  width: `${Math.max(0, ((skipTimes.outro.end - skipTimes.outro.start) / duration) * 100)}%`
                }}
                title="Outro"
              />
            )}
            {skipTimes.intro && duration > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-2 z-20 h-4 w-0.5 bg-warning"
                  style={{ left: markerPosition(skipTimes.intro.start) }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-2 z-20 h-4 w-0.5 bg-warning"
                  style={{ left: markerPosition(skipTimes.intro.end) }}
                />
              </>
            )}
            {skipTimes.outro && duration > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-2 z-20 h-4 w-0.5 bg-destructive"
                  style={{ left: markerPosition(skipTimes.outro.start) }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-2 z-20 h-4 w-0.5 bg-destructive"
                  style={{ left: markerPosition(skipTimes.outro.end) }}
                />
              </>
            )}
            <input
              aria-label="Seek video"
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="custom-player-seek absolute inset-0 h-8 w-full cursor-pointer appearance-none rounded-full bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="touch-target h-10 w-10 rounded-xl p-0 text-white hover:bg-white/15"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-white" />
                ) : (
                  <Play className="h-4 w-4 fill-white" />
                )}
              </Button>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                  className="touch-target h-10 w-10 rounded-xl p-0 text-white hover:bg-white/15"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="h-1 w-14 cursor-pointer appearance-none overflow-hidden rounded-lg bg-white/30 accent-white sm:w-20"
                />
              </div>
              <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-white/75 sm:text-xs">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2 relative">
              {showSettings && (
                <div className="absolute bottom-14 right-0 z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <div className="border-b border-white/10 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                    Settings
                  </div>

                  {showDubToggle && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-white/50">Language</label>
                      <div className="flex items-center rounded-md border border-white/10 bg-black/40 overflow-hidden shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDubToggle(false)}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-none py-1 text-xs font-medium transition-colors ${
                            !isDub
                              ? "bg-primary text-primary-foreground hover:bg-primary/95"
                              : "text-white/70 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Mic2 className="w-3.5 h-3.5" />
                          SUB
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDubToggle(true)}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-none py-1 text-xs font-medium transition-colors ${
                            isDub
                              ? "bg-primary text-primary-foreground hover:bg-primary/95"
                              : "text-white/70 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Mic2 className="w-3.5 h-3.5" />
                          DUB
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/50">Source</label>
                    <ProviderSourceSelect
                      groupedSources={groupedSources}
                      selectedSource={selectedSource}
                      useCustomPlayer
                      onSelect={(url, mode) => {
                        onSelectProvider(url, mode);
                        setShowSettings(false);
                      }}
                      providerIdType={providerIdType}
                      onProviderIdTypeChange={onProviderIdTypeChange}
                      variant="panel"
                    />
                  </div>

                  {content.type === "movie" && (
                    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                      <label className="text-xs font-medium text-white/70">Download</label>
                      {downloadUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 text-xs text-white hover:bg-white/10"
                          onClick={() => handleDownload()}
                        >
                          {downloadState.status === "downloading" ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          {downloadState.status === "downloading"
                            ? `Pause download${downloadProgress === null ? "" : ` · ${downloadProgress}%`}`
                            : downloadState.status === "paused"
                              ? `Resume download${downloadProgress === null ? "" : ` · ${downloadProgress}%`}`
                              : downloadState.status === "error"
                                ? "Retry download"
                                : "Download movie"}
                        </Button>
                      ) : (
                        <p className="text-[11px] text-white/50">
                          Download is unavailable for this stream.
                        </p>
                      )}
                      {downloadState.status === "error" && (
                        <p className="text-[11px] text-destructive">{downloadState.message}</p>
                      )}
                    </div>
                  )}
                  {content.type === "tv" && getEpisodeEmbedUrl && (
                    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                      <div>
                        <p className="text-xs font-medium text-white/70">More episodes</p>
                        <p className="text-[11px] text-white/45">
                          Choose episodes from the content modal.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={batchDownloadState.status === "downloading"}
                        className="w-full justify-start gap-2 text-xs text-white/80 hover:bg-white/10"
                        onClick={onOpenEpisodePicker}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {batchDownloadProgress === null
                          ? "Download episodes"
                          : `Downloading episodes · ${batchDownloadProgress}%`}
                      </Button>
                      {batchDownloadState.status === "downloading" && (
                        <p className="text-[11px] text-white/50">
                          Downloading episode {batchDownloadState.completed + 1} of{" "}
                          {batchDownloadState.total}
                        </p>
                      )}
                      {batchDownloadState.status === "completed" && (
                        <p className="text-[11px] text-emerald-400">
                          Downloaded {batchDownloadState.completed} episodes.
                        </p>
                      )}
                      {batchDownloadState.status === "error" && (
                        <p className="text-[11px] text-destructive">{batchDownloadState.message}</p>
                      )}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full flex items-center justify-start gap-2 text-xs text-white hover:bg-white/10 py-1.5 mt-1 border-t border-white/10 pt-2 rounded-none"
                    onClick={() => {
                      onInfoClick();
                      setShowSettings(false);
                    }}
                  >
                    <Info className="w-3.5 h-3.5" />
                    Details
                  </Button>
                </div>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                aria-label="Open settings"
                title="Settings"
                className={`touch-target h-10 w-10 rounded-xl p-0 text-white hover:bg-white/15 ${
                  showSettings ? "bg-white/15" : ""
                }`}
              >
                <Settings className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="touch-target h-10 w-10 rounded-xl p-0 text-white hover:bg-white/15"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {mediaError && (
        <div className="absolute inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-destructive/40 bg-background/95 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-1/4">
          <p className="eyebrow text-destructive">Playback error</p>
          <p className="mt-2 font-display text-lg font-semibold text-foreground">
            Video unavailable
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{mediaError}</p>
          <Button size="sm" className="mt-4" onClick={() => navigate("/")}>
            Choose another file from Home
          </Button>
        </div>
      )}

      {(isIntro || isOutro) && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.currentTime = isIntro ? skipTimes.intro!.end : skipTimes.outro!.end;
            }
          }}
          className="absolute bottom-28 right-4 z-50 rounded-xl border border-white/20 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-black shadow-xl shadow-black/30 hover:bg-white/90 sm:bottom-32 sm:right-6"
        >
          Skip {isIntro ? "Intro" : "Outro"}
        </Button>
      )}
    </div>
  );
}
