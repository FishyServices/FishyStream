import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Info,
  Mic2,
  Play,
  Pause,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Settings,
  Download,
  Zap,
  FastForward
} from "lucide-react";
import {
  Button,
  Slider,
  Popover,
  PopoverTrigger,
  PopoverPortal,
  PopoverPositioner,
  PopoverContent,
  Separator
} from "@fishy/ui";
import {
  ProviderSourceSelect,
  type ProviderIdType,
  type ProviderUiMode
} from "@/ui/components/ProviderSourceSelect";
import type { ContentPlayback } from "@content/contentMetadata";
import type { PlaybackEvent } from "@/features/playback/usePlaybackSession";
import { useVideoDownloads } from "@/ui/components/custom-video-player/downloads";
import {
  getCustomPlayerVolume,
  setCustomPlayerVolume,
  getCustomPlayerVolumeBoost,
  setCustomPlayerVolumeBoost
} from "@/shared/storage/localStorageStore";

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
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(() => getCustomPlayerVolume());
  const [volumeBoost, setVolumeBoost] = useState(() => getCustomPlayerVolumeBoost());
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [supportsPip, setSupportsPip] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [volumeHud, setVolumeHud] = useState<{
    visible: boolean;
    volume: number;
    volumeBoost: number;
    muted: boolean;
  }>({
    visible: false,
    volume,
    volumeBoost,
    muted: false
  });
  const volumeHudTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const volumeRef = useRef(volume);
  const volumeBoostRef = useRef(volumeBoost);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    volumeBoostRef.current = volumeBoost;
  }, [volumeBoost]);

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

  const showVolumeToast = (v: number, boost: number, muted: boolean) => {
    setVolumeHud({ visible: true, volume: v, volumeBoost: boost, muted });
    if (volumeHudTimeoutRef.current) {
      clearTimeout(volumeHudTimeoutRef.current);
    }
    volumeHudTimeoutRef.current = setTimeout(() => {
      setVolumeHud((prev) => ({ ...prev, visible: false }));
    }, 1400);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (volumeHudTimeoutRef.current) {
        clearTimeout(volumeHudTimeoutRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    setSupportsPip(
      typeof document !== "undefined" &&
        ("pictureInPictureEnabled" in document ? document.pictureInPictureEnabled : true)
    );
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
        handleVolumeChange(Math.min(1, Number((volumeRef.current + 0.05).toFixed(2))));
        triggerControls();
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        handleVolumeChange(Math.max(0, Number((volumeRef.current - 0.05).toFixed(2))));
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
      } else if (e.code === "KeyP") {
        e.preventDefault();
        togglePip();
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

      if (volumeBoostRef.current > 1 && !audioSourceRef.current) {
        initAudioBoost();
      } else if (!gainNodeRef.current) {
        video.volume = volumeRef.current;
      }

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

    if (volumeBoostRef.current > 1 && !audioSourceRef.current) {
      initAudioBoost();
    } else if (!gainNodeRef.current) {
      video.volume = volumeRef.current;
    }

    const handlePlayState = () => {
      setIsPlaying(!video.paused);
    };
    const handleVolumeState = () => {
      if (!gainNodeRef.current) {
        setVolume(video.volume);
        setCustomPlayerVolume(video.volume);
      }
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

    const handleProgress = () => {
      if (!video.buffered || video.buffered.length === 0) return;
      let end = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime) {
          end = Math.max(end, video.buffered.end(i));
        }
      }
      setBufferedEnd(end);
    };

    video.addEventListener("play", handlePlayState);
    video.addEventListener("pause", handlePlayState);
    video.addEventListener("volumechange", handleVolumeState);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("loadedmetadata", handleDurationChange);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("ended", handlePlayState);

    return () => {
      video.removeEventListener("play", handlePlayState);
      video.removeEventListener("pause", handlePlayState);
      video.removeEventListener("volumechange", handleVolumeState);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("loadedmetadata", handleDurationChange);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handlePlayState);
    };
  }, [isScraping, onPlaybackEvent]);

  const initAudioBoost = () => {
    if (!videoRef.current || audioSourceRef.current) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const source = ctx.createMediaElementSource(videoRef.current);
      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : volumeRef.current * volumeBoostRef.current;
      source.connect(gain);
      gain.connect(ctx.destination);
      audioContextRef.current = ctx;
      gainNodeRef.current = gain;
      audioSourceRef.current = source;
      if (videoRef.current) {
        videoRef.current.volume = 1;
      }
    } catch (err) {
      console.error("Failed to initialize audio booster:", err);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (volumeBoostRef.current > 1 && !audioSourceRef.current) {
      initAudioBoost();
    }
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }
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
    const clamped = Math.min(1, Math.max(0, value));
    setVolume(clamped);
    volumeRef.current = clamped;
    setCustomPlayerVolume(clamped);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : clamped * volumeBoostRef.current;
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
    } else if (videoRef.current) {
      videoRef.current.volume = clamped;
    }

    if (clamped > 0 && isMuted && videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      showVolumeToast(clamped, volumeBoostRef.current, false);
    } else {
      showVolumeToast(clamped, volumeBoostRef.current, isMuted);
    }
  };

  const handleVolumeBoostChange = (boostValue: number) => {
    const clamped = Math.min(3, Math.max(1, boostValue));
    setVolumeBoost(clamped);
    volumeBoostRef.current = clamped;
    setCustomPlayerVolumeBoost(clamped);

    if (clamped > 1 && !audioSourceRef.current) {
      initAudioBoost();
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volumeRef.current * clamped;
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
    }

    showVolumeToast(volumeRef.current, clamped, isMuted);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    setIsMuted(nextMute);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextMute ? 0 : volumeRef.current * volumeBoostRef.current;
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
    }

    showVolumeToast(volumeRef.current, volumeBoostRef.current, nextMute);
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        if (volumeBoostRef.current > 1 && !audioSourceRef.current) {
          initAudioBoost();
        }
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume().catch(() => {});
        }
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error("Picture-in-Picture failed:", err);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPip = () => setIsPip(true);
    const handleLeavePip = () => setIsPip(false);

    video.addEventListener("enterpictureinpicture", handleEnterPip);
    video.addEventListener("leavepictureinpicture", handleLeavePip);

    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnterPip);
      video.removeEventListener("leavepictureinpicture", handleLeavePip);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const subTitle =
      content.type === "tv"
        ? `S${tvTarget.season} · E${tvTarget.episode}`
        : content.year
          ? String(content.year)
          : "";

    navigator.mediaSession.metadata = new MediaMetadata({
      title: content.title,
      artist: subTitle,
      album: content.type === "tv" ? content.title : "Movie",
      artwork: content.posterUrl
        ? [{ src: content.posterUrl, sizes: "512x512", type: "image/jpeg" }]
        : []
    });

    const handlePlay = () => {
      if (videoRef.current && videoRef.current.paused) {
        if (volumeBoostRef.current > 1 && !audioSourceRef.current) {
          initAudioBoost();
        }
        if (audioContextRef.current?.state === "suspended") {
          audioContextRef.current.resume().catch(() => {});
        }
        videoRef.current.play().catch(() => {});
      }
    };

    const handlePause = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    };

    const handleSeekBackward = () => {
      if (videoRef.current) {
        handleSeek(Math.max(0, videoRef.current.currentTime - 10));
      }
    };

    const handleSeekForward = () => {
      if (videoRef.current) {
        handleSeek(
          Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + 10)
        );
      }
    };

    const handleSeekTo = (details: MediaSessionActionDetails) => {
      if (videoRef.current && details.seekTime !== undefined) {
        handleSeek(details.seekTime);
      }
    };

    try {
      navigator.mediaSession.setActionHandler("play", handlePlay);
      navigator.mediaSession.setActionHandler("pause", handlePause);
      navigator.mediaSession.setActionHandler("seekbackward", handleSeekBackward);
      navigator.mediaSession.setActionHandler("seekforward", handleSeekForward);
      navigator.mediaSession.setActionHandler("seekto", handleSeekTo);
    } catch {}

    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("seekto", null);
      } catch {}
    };
  }, [
    content.title,
    content.posterUrl,
    content.type,
    content.year,
    tvTarget.season,
    tvTarget.episode
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    if (duration > 0 && Number.isFinite(duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(currentTime, duration)
        });
      } catch {}
    }
  }, [isPlaying, currentTime, duration]);

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

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * (duration || 0));
  };

  const handleScrubberMouseLeave = () => {
    setHoverTime(null);
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

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        containerRef.current?.focus();
      }}
      onMouseMove={triggerControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="group/custom-player relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-black outline-none focus:outline-none"
    >
      <video
        ref={videoRef}
        onClick={togglePlay}
        onContextMenu={(e) => {
          e.preventDefault();
          containerRef.current?.focus();
        }}
        onDoubleClick={toggleFullscreen}
        onError={handleMediaError}
        className={`h-full w-full object-contain ${showControls ? "cursor-pointer" : "cursor-none"}`}
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
        className={`pointer-events-none absolute inset-0 z-20 bg-linear-to-b from-black/70 via-transparent to-black/80 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute inset-0 z-30 flex flex-col justify-between transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-4 px-4 pt-4 sm:px-8 sm:pt-7">
          <div className="flex min-w-0 items-center gap-3.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="touch-target shrink-0 rounded-full text-white/90 hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-medium leading-tight text-white sm:text-lg">
                {content.title}
              </p>
              {content.type === "tv" && (
                <p className="mt-0.5 truncate text-[13px] text-white/55">
                  S{tvTarget.season} · E{tvTarget.episode}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onInfoClick}
            aria-label="Show details"
            className="touch-target shrink-0 rounded-full text-white/80 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <Info className="h-5 w-5" />
          </Button>
        </div>

        {isScraping && !mediaError && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-11 w-11 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
          </div>
        )}

        {!isPlaying && !isScraping && !mediaError && (
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            aria-label="Play"
            className="absolute left-1/2 top-1/2 h-18 w-18 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-white/20 active:scale-95"
          >
            <Play className="ml-1 h-8 w-8 fill-current stroke-none" />
          </Button>
        )}

        <div className="mx-3 mb-3 sm:mx-8 sm:mb-7" onClick={(e) => e.stopPropagation()}>
          <div
            className="group/scrubber relative mb-2.5 flex h-5 w-full cursor-pointer items-center"
            onMouseMove={handleScrubberMouseMove}
            onMouseLeave={handleScrubberMouseLeave}
          >
            {hoverTime !== null && (
              <div
                className="pointer-events-none absolute -top-9 z-30 -translate-x-1/2 rounded-md bg-neutral-950/95 px-2 py-1 font-mono text-[11px] font-medium text-white shadow-lg ring-1 ring-white/10"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 h-0.75 rounded-full bg-white/25 transition-all group-hover/scrubber:h-1.5" />
            <div
              className="pointer-events-none absolute left-0 h-0.75 rounded-full bg-white/45 transition-all group-hover/scrubber:h-1.5"
              style={{ width: `${duration ? Math.min(100, (bufferedEnd / duration) * 100) : 0}%` }}
            />
            <div
              className="pointer-events-none absolute left-0 h-0.75 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--color-primary)_60%,transparent)] transition-all group-hover/scrubber:h-1.5"
              style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
            />
            {skipTimes.intro && duration > 0 && (
              <div
                className="pointer-events-none absolute top-1/2 z-10 h-0.75 -translate-y-1/2 rounded-full bg-warning transition-all group-hover/scrubber:h-1.5"
                style={{
                  left: markerPosition(skipTimes.intro.start),
                  width: `${Math.max(0, ((skipTimes.intro.end - skipTimes.intro.start) / duration) * 100)}%`
                }}
                title="Intro"
              />
            )}
            {skipTimes.outro && duration > 0 && (
              <div
                className="pointer-events-none absolute top-1/2 z-10 h-0.75 -translate-y-1/2 rounded-full bg-destructive transition-all group-hover/scrubber:h-1.5"
                style={{
                  left: markerPosition(skipTimes.outro.start),
                  width: `${Math.max(0, ((skipTimes.outro.end - skipTimes.outro.start) / duration) * 100)}%`
                }}
                title="Outro"
              />
            )}
            <input
              aria-label="Seek video"
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="custom-player-seek absolute inset-0 h-5 w-full cursor-pointer appearance-none rounded-full bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="touch-target rounded-full text-white hover:bg-white/10 active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                )}
              </Button>

              <div className="group/vol flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                  className="touch-target shrink-0 rounded-full text-white/85 hover:bg-white/10 hover:text-white"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4.5 w-4.5" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="h-4.5 w-4.5" />
                  ) : (
                    <Volume2 className="h-4.5 w-4.5" />
                  )}
                </Button>
                <div className="w-14 pl-0.5 sm:w-0 sm:overflow-hidden sm:pl-0 sm:transition-all sm:duration-200 sm:group-hover/vol:w-20 sm:group-hover/vol:pl-1">
                  <div className="relative flex h-8 w-full items-center">
                    <div className="pointer-events-none absolute inset-x-0 h-0.75 rounded-full bg-white/25" />
                    <div
                      className="pointer-events-none absolute left-0 h-0.75 rounded-full bg-primary"
                      style={{ width: `${Math.round((isMuted ? 0 : volume) * 100)}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                      aria-label="Volume slider"
                      className="custom-player-seek absolute inset-0 h-8 w-full cursor-pointer appearance-none rounded-full bg-transparent"
                    />
                  </div>
                </div>
              </div>

              <span className="ml-1 whitespace-nowrap font-mono text-xs tabular-nums text-white/60 sm:ml-2">
                <span className="text-white">{formatTime(currentTime)}</span>
                <span className="mx-1.5 text-white/30">/</span>
                <span>{formatTime(duration)}</span>
              </span>
            </div>

            <div className="relative flex items-center gap-1">
              <Popover open={showSettings} onOpenChange={setShowSettings}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Open settings"
                      title="Settings"
                      className={`touch-target relative rounded-full text-white/85 hover:bg-white/10 hover:text-white ${
                        showSettings ? "bg-white/10 text-white" : ""
                      }`}
                    >
                      <Settings className="h-4.5 w-4.5" />
                      {volumeBoost > 1 && (
                        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </Button>
                  }
                />
                <PopoverPortal>
                  <PopoverPositioner side="top" align="end" sideOffset={12}>
                    <PopoverContent className="flex max-h-[70vh] w-[min(21rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto rounded-2xl bg-neutral-950/97 p-4 text-white shadow-2xl shadow-black/70 ring-1 ring-white/10 backdrop-blur-2xl">
                      <p className="font-display text-sm font-medium text-white">Settings</p>

                      <div className="flex flex-col gap-2.5 rounded-xl bg-white/5 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap
                              className={`h-3.5 w-3.5 ${
                                volumeBoost > 1 ? "text-primary" : "text-white/50"
                              }`}
                            />
                            <span className="text-[13px] text-white/85">Volume boost</span>
                          </div>
                          <span
                            className={`font-mono text-xs tabular-nums ${
                              volumeBoost > 1 ? "text-primary" : "text-white/45"
                            }`}
                          >
                            {Math.round(volumeBoost * 100)}%
                          </span>
                        </div>

                        <Slider
                          value={volumeBoost}
                          onValueChange={(next) =>
                            handleVolumeBoostChange(
                              Array.isArray(next) ? next[0] : (next as number)
                            )
                          }
                          min={1}
                          max={3}
                          step={0.05}
                          aria-label="Volume Boost Multiplier"
                          className="py-1"
                        />

                        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                          {[
                            { label: "100%", val: 1.0 },
                            { label: "150%", val: 1.5 },
                            { label: "200%", val: 2.0 },
                            { label: "300%", val: 3.0 }
                          ].map((preset) => (
                            <Button
                              key={preset.val}
                              variant={
                                Math.abs(volumeBoost - preset.val) < 0.05 ? "default" : "ghost"
                              }
                              size="sm"
                              onClick={() => handleVolumeBoostChange(preset.val)}
                              className="h-7 rounded-lg font-mono text-[11px] text-white/60 hover:text-white"
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {showDubToggle && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[13px] text-white/85">Language</p>
                          <div className="flex shrink-0 items-center overflow-hidden rounded-xl bg-white/5 p-0.5">
                            <Button
                              variant={!isDub ? "default" : "ghost"}
                              size="sm"
                              onClick={() => handleDubToggle(false)}
                              className="flex-1 gap-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white"
                            >
                              <Mic2 className="h-3.5 w-3.5" />
                              Sub
                            </Button>
                            <Button
                              variant={isDub ? "default" : "ghost"}
                              size="sm"
                              onClick={() => handleDubToggle(true)}
                              className="flex-1 gap-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white"
                            >
                              <Mic2 className="h-3.5 w-3.5" />
                              Dub
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <p className="text-[13px] text-white/85">Source</p>
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
                        <>
                          <Separator className="bg-white/10" />
                          <div className="flex flex-col gap-2">
                            <p className="text-[13px] text-white/85">Download</p>
                            {downloadUrl ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start gap-2 text-xs text-white/85 hover:bg-white/5 hover:text-white"
                                onClick={() => handleDownload()}
                              >
                                {downloadState.status === "downloading" ? (
                                  <Pause className="h-3.5 w-3.5" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
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
                              <p className="text-[11px] text-white/45">
                                Download is unavailable for this stream.
                              </p>
                            )}
                            {downloadState.status === "error" && (
                              <p className="text-[11px] text-destructive">
                                {downloadState.message}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                      {content.type === "tv" && getEpisodeEmbedUrl && (
                        <>
                          <Separator className="bg-white/10" />
                          <div className="flex flex-col gap-2">
                            <div>
                              <p className="text-[13px] text-white/85">More episodes</p>
                              <p className="mt-0.5 text-[11px] text-white/45">
                                Choose episodes from the content modal.
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={batchDownloadState.status === "downloading"}
                              className="w-full justify-start gap-2 text-xs text-white/80 hover:bg-white/5 hover:text-white"
                              onClick={onOpenEpisodePicker}
                            >
                              <Download className="h-3.5 w-3.5" />
                              {batchDownloadProgress === null
                                ? "Download episodes"
                                : `Downloading episodes · ${batchDownloadProgress}%`}
                            </Button>
                            {batchDownloadState.status === "downloading" && (
                              <p className="text-[11px] text-white/45">
                                Downloading episode {batchDownloadState.completed + 1} of{" "}
                                {batchDownloadState.total}
                              </p>
                            )}
                            {batchDownloadState.status === "completed" && (
                              <p className="text-[11px] text-success">
                                Downloaded {batchDownloadState.completed} episodes.
                              </p>
                            )}
                            {batchDownloadState.status === "error" && (
                              <p className="text-[11px] text-destructive">
                                {batchDownloadState.message}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                      <Separator className="bg-white/10" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 text-xs text-white/85 hover:bg-white/5 hover:text-white"
                        onClick={() => {
                          onInfoClick();
                          setShowSettings(false);
                        }}
                      >
                        <Info className="h-3.5 w-3.5" />
                        Details
                      </Button>
                    </PopoverContent>
                  </PopoverPositioner>
                </PopoverPortal>
              </Popover>

              {supportsPip && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePip}
                  aria-label={isPip ? "Exit Picture-in-Picture" : "Enter Picture-in-Picture"}
                  title="Picture-in-Picture (p)"
                  className={`touch-target rounded-full hover:bg-white/10 ${
                    isPip
                      ? "bg-white/15 text-primary hover:text-primary"
                      : "text-white/85 hover:text-white"
                  }`}
                >
                  <PictureInPicture2 className="h-4.5 w-4.5" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="touch-target rounded-full text-white/85 hover:bg-white/10 hover:text-white"
              >
                {isFullscreen ? (
                  <Minimize className="h-4.5 w-4.5" />
                ) : (
                  <Maximize className="h-4.5 w-4.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {volumeHud.visible && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-neutral-950/90 px-4 py-2 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl transition-all duration-200 animate-in fade-in zoom-in-95">
          {volumeHud.muted || volumeHud.volume === 0 ? (
            <VolumeX className="h-4.5 w-4.5 text-white/60" />
          ) : volumeHud.volume < 0.5 ? (
            <Volume1 className="h-4.5 w-4.5 text-primary" />
          ) : (
            <Volume2 className="h-4.5 w-4.5 text-primary" />
          )}
          <span className="font-mono text-xs font-medium text-white">
            {volumeHud.muted ? "Muted" : `${Math.round(volumeHud.volume * 100)}%`}
          </span>
          {volumeHud.volumeBoost > 1 && (
            <div className="flex items-center gap-1 border-l border-white/15 pl-2.5 text-xs font-semibold text-primary">
              <Zap className="h-3 w-3 fill-current" />
              <span>{Math.round(volumeHud.volumeBoost * 100)}%</span>
            </div>
          )}
        </div>
      )}

      {mediaError && (
        <div className="absolute inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl bg-neutral-950/95 p-7 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-xl sm:inset-x-1/4">
          <p className="text-xs font-medium text-destructive">Playback error</p>
          <p className="mt-2 font-display text-lg font-medium text-white">Video unavailable</p>
          <p className="mt-2 text-sm text-white/55">{mediaError}</p>
          <Button onClick={() => navigate("/")} className="mt-5 rounded-full">
            Choose another file from Home
          </Button>
        </div>
      )}

      {(isIntro || isOutro) && (
        <Button
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.currentTime = isIntro ? skipTimes.intro!.end : skipTimes.outro!.end;
            }
          }}
          className="absolute bottom-24 right-4 z-50 gap-2 rounded-full bg-white/10 text-sm font-medium text-white ring-1 ring-inset ring-white/20 backdrop-blur-xl hover:bg-primary hover:text-primary-foreground hover:ring-primary/50 sm:bottom-28 sm:right-8"
        >
          <span>Skip {isIntro ? "intro" : "outro"}</span>
          <FastForward className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
