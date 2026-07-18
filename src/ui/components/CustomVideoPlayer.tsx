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
  Loader2,
  Settings
} from "lucide-react";
import { Button } from "@fishy/ui";
import { ProviderSourceSelect, type ProviderUiMode } from "@/ui/components/ProviderSourceSelect";
import type { ContentPlayback } from "@content/contentMetadata";
import type { PlaybackEvent } from "@/features/playback/usePlaybackSession";

interface CustomVideoPlayerProps {
  embedUrl: string;
  content: ContentPlayback;
  tvTarget: { season: number; episode: number };
  animeContent: boolean;
  isDub: boolean;
  onPlaybackEvent: (event: PlaybackEvent) => void;
  showDubToggle: boolean;
  handleDubToggle: (isDub: boolean) => void;
  selectedSource: string;
  onSelectProvider: (nextUrl: string, mode: ProviderUiMode) => void;
  groupedSources: any[];
  onInfoClick: () => void;
}

function clamp(v: number) {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
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
  content,
  tvTarget,
  animeContent,
  isDub,
  onPlaybackEvent,
  showDubToggle,
  handleDubToggle,
  selectedSource,
  onSelectProvider,
  groupedSources,
  onInfoClick
}: CustomVideoPlayerProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSettings(false);
      }
    }, 2500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.tagName === "BUTTON"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
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
    if (!embedUrl) return;

    let isMounted = true;
    setIsScraping(true);

    const fetchRawStream = async () => {
      try {
        const scraperEndpoint = import.meta.env.DEV
          ? "http://localhost:4000/api/scrape"
          : "/api/scrape";
        const res = await fetch(`${scraperEndpoint}?url=${encodeURIComponent(embedUrl)}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.streamUrl && videoRef.current) {
          if (data.tracks) setSubtitles(data.tracks);
          if (data.intro || data.outro) setSkipTimes({ intro: data.intro, outro: data.outro });

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

          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(data.streamUrl);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              const startSeconds = getStartAtSeconds();
              if (startSeconds > 0 && videoRef.current) {
                videoRef.current.currentTime = startSeconds;
              }
              videoRef.current?.play().catch(() => {});
            });
          } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = data.streamUrl;
            const startSeconds = getStartAtSeconds();
            if (startSeconds > 0) {
              const handleLoaded = () => {
                if (videoRef.current) {
                  videoRef.current.currentTime = startSeconds;
                }
                videoRef.current?.removeEventListener("loadedmetadata", handleLoaded);
                videoRef.current?.play().catch(() => {});
              };
              videoRef.current.addEventListener("loadedmetadata", handleLoaded);
            } else {
              videoRef.current.play().catch(() => {});
            }
          }
        }
      } catch (e) {
      } finally {
        if (isMounted) {
          setIsScraping(false);
        }
      }
    };

    fetchRawStream();
    return () => {
      isMounted = false;
    };
  }, [embedUrl]);

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
      setDuration(video.duration);
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
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handlePlayState);

    return () => {
      video.removeEventListener("play", handlePlayState);
      video.removeEventListener("pause", handlePlayState);
      video.removeEventListener("volumechange", handleVolumeState);
      video.removeEventListener("durationchange", handleDurationChange);
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
    if (value > 0 && isMuted) {
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

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative h-full w-full bg-black flex items-center justify-center select-none overflow-hidden group/custom-player"
    >
      {isScraping && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-white/70">Loading stream</p>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        className="w-full h-full object-contain cursor-pointer"
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
        className={`absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/80 flex flex-col justify-between transition-opacity duration-300 z-30 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="w-full p-4 flex items-center justify-between">
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
        </div>

        <div className="w-full p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="w-full flex items-center gap-2 group/scrubber">
            <span className="text-xs text-white/80 font-mono w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary group-hover/scrubber:h-2 transition-all"
            />
            <span className="text-xs text-white/80 font-mono w-12 text-left">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                className="text-white hover:scale-110 active:scale-95 transition-transform p-1.5 bg-white/10 rounded-full hover:bg-white/20 h-9 w-9"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-white" />
                ) : (
                  <Play className="w-6 h-6 fill-white" />
                )}
              </Button>

              <div className="flex items-center gap-2 group/volume">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="text-white hover:bg-white/15 p-1.5 rounded-full transition-colors h-8 w-8"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 relative">
              {showSettings && (
                <div className="absolute bottom-12 right-0 bg-neutral-950/95 border border-white/10 rounded-lg p-3 w-64 flex flex-col gap-3 shadow-2xl backdrop-blur-md text-white z-50">
                  <div className="text-xs font-semibold text-white/50 border-b border-white/10 pb-1.5">
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
                      variant="panel"
                    />
                  </div>

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
                className={`text-white hover:bg-white/15 p-2 rounded-full transition-colors h-9 w-9 ${
                  showSettings ? "bg-white/15" : ""
                }`}
              >
                <Settings className="w-5 h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/15 p-2 rounded-full transition-colors h-9 w-9"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {(isIntro || isOutro) && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.currentTime = isIntro ? skipTimes.intro!.end : skipTimes.outro!.end;
            }
          }}
          className="absolute bottom-24 right-4 z-50 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Skip {isIntro ? "Intro" : "Outro"}
        </Button>
      )}
    </div>
  );
}
