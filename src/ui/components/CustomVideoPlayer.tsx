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
  Settings,
  Download,
  ListVideo
} from "lucide-react";
import { Button } from "@fishy/ui";
import { ProviderSourceSelect, type ProviderUiMode } from "@/ui/components/ProviderSourceSelect";
import type { ContentPlayback } from "@content/contentMetadata";
import type { PlaybackEvent } from "@/features/playback/usePlaybackSession";
import {
  getStoredDownload,
  removeStoredDownload,
  setStoredDownload
} from "@/shared/storage/downloadStore";

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

type DownloadState =
  | { status: "idle" }
  | { status: "downloading"; received: number; total: number }
  | { status: "paused"; received: number; total: number }
  | { status: "completed" }
  | { status: "error"; message: string };

type HlsPlaylist =
  | { kind: "master"; variants: Array<{ url: string; bandwidth: number }> }
  | { kind: "media"; parts: string[]; encrypted: boolean };

const STORED_DOWNLOAD_TTL_MS = 30_000;

function saveDownloadPart(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function parseHlsPlaylist(text: string, baseUrl: string): HlsPlaylist {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const variants: Array<{ url: string; bandwidth: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || !line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/)?.[1] ?? 0);
    const variantUrl = lines
      .slice(index + 1)
      .find((candidate) => candidate && !candidate.startsWith("#"));
    if (variantUrl) variants.push({ url: new URL(variantUrl, baseUrl).href, bandwidth });
  }

  if (variants.length > 0) return { kind: "master", variants };

  const encrypted = lines.some(
    (line) => line.startsWith("#EXT-X-KEY:") && !/METHOD=NONE/i.test(line)
  );
  const parts: string[] = [];
  const mapLine = lines.find((line) => line.startsWith("#EXT-X-MAP:"));
  const mapUrl = mapLine?.match(/URI="([^"]+)"/)?.[1];
  if (mapUrl) parts.push(new URL(mapUrl, baseUrl).href);

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    parts.push(new URL(line, baseUrl).href);
  }

  return { kind: "media", parts, encrypted };
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
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: "idle" });
  const [selectedBatchEpisodes, setSelectedBatchEpisodes] = useState<number[]>([]);
  const [batchDownloadState, setBatchDownloadState] = useState<
    | { status: "idle" }
    | { status: "downloading"; completed: number; total: number; progress: number }
    | { status: "completed"; completed: number; total: number }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const batchDownloadAbortRef = useRef<AbortController | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const downloadChunksRef = useRef<Blob[]>([]);
  const downloadReceivedRef = useRef(0);
  const downloadTotalRef = useRef(0);
  const downloadContentTypeRef = useRef("video/mp4");
  const downloadLastPersistedRef = useRef(0);
  const downloadModeRef = useRef<"file" | "hls">("file");
  const downloadPartsRef = useRef(false);
  const downloadStorageKey = `${content._id}:${tvTarget.season}:${tvTarget.episode}:${selectedSource}`;

  useEffect(() => {
    setSelectedBatchEpisodes([]);
  }, [tvTarget.season]);

  useEffect(() => {
    return () => batchDownloadAbortRef.current?.abort();
  }, []);

  const persistDownload = async (url: string, filename: string) => {
    if (localFile || downloadReceivedRef.current <= 0) return;

    await setStoredDownload({
      key: downloadStorageKey,
      kind: downloadModeRef.current,
      url,
      filename,
      chunks: downloadChunksRef.current,
      received: downloadReceivedRef.current,
      total: downloadTotalRef.current,
      contentType: downloadContentTypeRef.current,
      updatedAt: Date.now()
    });
  };

  const downloadBatchEpisode = async (
    target: { season: number; episode: number },
    signal: AbortSignal,
    onProgress: (progress: number) => void
  ) => {
    if (!getEpisodeEmbedUrl) throw new Error("Episode downloads are unavailable.");
    const embedUrlForEpisode = await getEpisodeEmbedUrl(target);
    if (!embedUrlForEpisode) throw new Error(`No stream found for episode ${target.episode}.`);

    const scraperEndpoint = import.meta.env.DEV
      ? "http://localhost:4000/api/scrape"
      : "/api/scrape";
    const scrapeResponse = await fetch(
      `${scraperEndpoint}?url=${encodeURIComponent(embedUrlForEpisode)}`,
      { signal }
    );
    if (!scrapeResponse.ok) throw new Error(`Could not load episode ${target.episode}.`);

    const data = (await scrapeResponse.json()) as { streamUrl?: unknown; mediaType?: unknown };
    if (typeof data.streamUrl !== "string" || !data.streamUrl) {
      throw new Error(`No downloadable stream found for episode ${target.episode}.`);
    }

    const filename = `${content.title} - S${target.season}E${target.episode}.mp4`;
    if (data.mediaType !== "hls" && !data.streamUrl.includes(".m3u8")) {
      const response = await fetch(data.streamUrl, { signal });
      if (!response.ok) throw new Error(`Episode ${target.episode} download failed.`);
      saveDownloadPart(await response.blob(), filename);
      onProgress(1);
      return;
    }

    const masterResponse = await fetch(data.streamUrl, { signal });
    if (!masterResponse.ok) throw new Error(`Episode ${target.episode} playlist failed.`);
    const playlist = parseHlsPlaylist(await masterResponse.text(), data.streamUrl);
    const mediaUrl =
      playlist.kind === "master"
        ? ([...playlist.variants].sort((a, b) => b.bandwidth - a.bandwidth)[0]?.url ?? null)
        : data.streamUrl;
    if (!mediaUrl) throw new Error(`Episode ${target.episode} has no video variant.`);

    const mediaResponse =
      playlist.kind === "master" ? await fetch(mediaUrl, { signal }) : masterResponse;
    if (!mediaResponse.ok) throw new Error(`Episode ${target.episode} media playlist failed.`);
    const mediaPlaylist =
      playlist.kind === "master"
        ? parseHlsPlaylist(await mediaResponse.text(), mediaUrl)
        : playlist;
    if (mediaPlaylist.kind !== "media" || mediaPlaylist.encrypted) {
      throw new Error(`Episode ${target.episode} uses an unsupported encrypted stream.`);
    }

    const parts: Blob[] = [];
    for (const [index, partUrl] of mediaPlaylist.parts.entries()) {
      const response = await fetch(partUrl, { signal });
      if (!response.ok) throw new Error(`Episode ${target.episode} segment failed.`);
      parts.push(await response.blob());
      onProgress((index + 1) / mediaPlaylist.parts.length);
    }
    saveDownloadPart(new Blob(parts, { type: "video/mp4" }), filename);
  };

  const handleBatchDownload = (requestedEpisodes = selectedBatchEpisodes) => {
    if (!getEpisodeEmbedUrl || content.type !== "tv") return;
    if (batchDownloadState.status === "downloading") return;

    const currentDownloadActive = ["downloading", "paused", "completed"].includes(
      downloadState.status
    );
    const targets = [...new Set(requestedEpisodes)]
      .filter((episode) => !(episode === tvTarget.episode && currentDownloadActive))
      .sort((a, b) => a - b)
      .map((episode) => ({
        season: tvTarget.season,
        episode
      }));
    if (targets.length === 0) return;
    const controller = new AbortController();
    batchDownloadAbortRef.current = controller;
    setBatchDownloadState({
      status: "downloading",
      completed: 0,
      total: targets.length,
      progress: 0
    });

    void (async () => {
      for (const [index, target] of targets.entries()) {
        await downloadBatchEpisode(target, controller.signal, (episodeProgress) => {
          setBatchDownloadState((current) =>
            current.status === "downloading"
              ? {
                  ...current,
                  progress: ((index + episodeProgress) / targets.length) * 100
                }
              : current
          );
        });
        setBatchDownloadState((current) =>
          current.status === "downloading"
            ? { ...current, completed: index + 1, progress: ((index + 1) / targets.length) * 100 }
            : current
        );
      }
    })()
      .then(() => {
        setBatchDownloadState({
          status: "completed",
          completed: targets.length,
          total: targets.length
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          setBatchDownloadState({ status: "idle" });
          return;
        }
        setBatchDownloadState({
          status: "error",
          message: error instanceof Error ? error.message : "Some episodes could not be downloaded."
        });
      })
      .finally(() => {
        if (batchDownloadAbortRef.current === controller) batchDownloadAbortRef.current = null;
      });
  };

  useEffect(() => {
    if (!downloadRequest || downloadRequest.season !== tvTarget.season) return;
    onDownloadRequestConsumed?.();
    setSelectedBatchEpisodes(downloadRequest.episodes);
    handleBatchDownload(downloadRequest.episodes);
  }, [downloadRequest, onDownloadRequestConsumed, tvTarget.season]);

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
      downloadAbortRef.current?.abort();
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
    setDownloadUrl(null);
    setDownloadState({ status: "idle" });
    downloadModeRef.current = "file";
    downloadAbortRef.current?.abort();
    downloadChunksRef.current = [];
    downloadReceivedRef.current = 0;
    downloadTotalRef.current = 0;
    downloadLastPersistedRef.current = 0;

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
          setDownloadUrl(localObjectUrl);
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
            setDownloadUrl(downloadUrl.href);
            downloadModeRef.current = "file";
            if (content.type === "movie")
              void getStoredDownload(downloadStorageKey)
                .then((stored) => {
                  if (stored && Date.now() - stored.updatedAt > STORED_DOWNLOAD_TTL_MS) {
                    void removeStoredDownload(downloadStorageKey);
                    return;
                  }
                  if (
                    !stored ||
                    stored.kind !== downloadModeRef.current ||
                    stored.url !== downloadUrl.href ||
                    stored.received <= 0
                  )
                    return;
                  downloadChunksRef.current = stored.chunks;
                  downloadReceivedRef.current = stored.received;
                  downloadTotalRef.current = stored.total;
                  downloadContentTypeRef.current = stored.contentType;
                  downloadLastPersistedRef.current = stored.received;
                  setDownloadState({
                    status: "paused",
                    received: stored.received,
                    total: stored.total
                  });
                })
                .catch(() => {});
          } else if (mediaType === "hls" && typeof data.streamUrl === "string") {
            setDownloadUrl(data.streamUrl);
            downloadModeRef.current = "hls";
            if (content.type === "movie")
              void getStoredDownload(downloadStorageKey)
                .then((stored) => {
                  if (stored && Date.now() - stored.updatedAt > STORED_DOWNLOAD_TTL_MS) {
                    void removeStoredDownload(downloadStorageKey);
                    return;
                  }
                  if (
                    !stored ||
                    stored.kind !== "hls" ||
                    stored.url !== data.streamUrl ||
                    stored.received <= 0
                  )
                    return;
                  downloadChunksRef.current = stored.chunks;
                  downloadReceivedRef.current = stored.received;
                  downloadTotalRef.current = stored.total;
                  downloadContentTypeRef.current = stored.contentType;
                  downloadLastPersistedRef.current = stored.received;
                  setDownloadState({
                    status: "paused",
                    received: stored.received,
                    total: stored.total
                  });
                })
                .catch(() => {});
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

  const handleMediaError = () => {
    if (!localFile) return;
    const isMkv = /\.mkv$/i.test(localFile.name);
    setMediaError(
      isMkv
        ? "This browser cannot decode MKV files here. Convert it to MP4 (H.264/AAC) or WebM, then try again."
        : "This video could not be decoded by your browser. Try MP4 (H.264/AAC) or WebM."
    );
  };

  const startHlsDownload = (args: {
    controller: AbortController;
    startAt: number;
    filename: string;
    downloadParts?: boolean;
  }) => {
    if (!downloadUrl) return;

    void (async () => {
      try {
        const masterResponse = await fetch(downloadUrl, { signal: args.controller.signal });
        if (!masterResponse.ok) throw new Error(`Download failed (${masterResponse.status}).`);
        const masterPlaylist = parseHlsPlaylist(await masterResponse.text(), downloadUrl);
        const mediaUrl =
          masterPlaylist.kind === "master"
            ? [...masterPlaylist.variants].sort((a, b) => b.bandwidth - a.bandwidth)[0]?.url
            : downloadUrl;
        if (!mediaUrl) throw new Error("The HLS stream has no playable variant.");

        const mediaResponse = await fetch(mediaUrl, { signal: args.controller.signal });
        if (!mediaResponse.ok) throw new Error(`Download failed (${mediaResponse.status}).`);
        const mediaPlaylist = parseHlsPlaylist(await mediaResponse.text(), mediaUrl);
        if (mediaPlaylist.kind !== "media" || mediaPlaylist.parts.length === 0) {
          throw new Error("The HLS stream has no media segments.");
        }
        if (mediaPlaylist.encrypted) {
          throw new Error("This HLS stream is encrypted and cannot be downloaded here.");
        }
        if (args.startAt > mediaPlaylist.parts.length) {
          throw new Error("The saved download no longer matches this stream.");
        }

        downloadTotalRef.current = mediaPlaylist.parts.length;
        setDownloadState({
          status: "downloading",
          received: args.startAt,
          total: mediaPlaylist.parts.length
        });

        for (let index = args.startAt; index < mediaPlaylist.parts.length; index += 1) {
          const segmentUrl = mediaPlaylist.parts[index];
          if (segmentUrl === undefined) throw new Error("The HLS segment list changed.");

          const segmentResponse = await fetch(segmentUrl, {
            signal: args.controller.signal
          });
          if (!segmentResponse.ok) {
            throw new Error(`Segment download failed (${segmentResponse.status}).`);
          }

          const segmentBlob = await segmentResponse.blob();
          downloadChunksRef.current.push(segmentBlob);
          if (args.downloadParts) {
            saveDownloadPart(
              segmentBlob,
              `${args.filename.replace(/\.mp4$/i, "")}.part-${String(index + 1).padStart(3, "0")}.ts`
            );
          }
          downloadReceivedRef.current = index + 1;
          setDownloadState({
            status: "downloading",
            received: downloadReceivedRef.current,
            total: downloadTotalRef.current
          });
          await persistDownload(downloadUrl, args.filename);
        }

        if (!args.downloadParts) {
          saveDownloadPart(
            new Blob(downloadChunksRef.current, { type: "video/mp4" }),
            args.filename
          );
        }
        await removeStoredDownload(downloadStorageKey);
        setDownloadState({ status: "completed" });
      } catch (error) {
        if (args.controller.signal.aborted) {
          await persistDownload(downloadUrl, args.filename).catch(() => {});
          setDownloadState({
            status: "paused",
            received: downloadReceivedRef.current,
            total: downloadTotalRef.current
          });
        } else {
          await persistDownload(downloadUrl, args.filename).catch(() => {});
          setDownloadState({
            status: "error",
            message: error instanceof Error ? error.message : "Download failed."
          });
        }
      } finally {
        if (downloadAbortRef.current === args.controller) downloadAbortRef.current = null;
      }
    })();
  };

  const handleDownload = (downloadParts = false) => {
    if (!downloadUrl) return;

    if (downloadState.status === "downloading") {
      downloadAbortRef.current?.abort();
      return;
    }

    if (downloadState.status === "completed" || downloadState.status === "error") {
      downloadChunksRef.current = [];
      downloadReceivedRef.current = 0;
      downloadTotalRef.current = 0;
      downloadLastPersistedRef.current = 0;
    }

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    const startAt = downloadReceivedRef.current;
    const filename = `${content.title}${content.type === "tv" ? ` - S${tvTarget.season}E${tvTarget.episode}` : ""}.mp4`;
    downloadPartsRef.current = downloadParts;

    setDownloadState({
      status: "downloading",
      received: startAt,
      total: downloadTotalRef.current
    });

    if (downloadModeRef.current === "hls") {
      startHlsDownload({
        controller,
        startAt,
        filename,
        downloadParts: downloadPartsRef.current
      });
      return;
    }

    void (async () => {
      try {
        const response = await fetch(downloadUrl, {
          headers: startAt > 0 ? { Range: `bytes=${startAt}-` } : undefined,
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Download failed (${response.status}).`);
        if (startAt > 0 && response.status !== 206) {
          throw new Error("This stream does not support resuming downloads.");
        }

        const contentRange = response.headers.get("content-range");
        const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
        const contentLength = Number(response.headers.get("content-length"));
        const total = rangeTotal
          ? Number(rangeTotal)
          : Number.isFinite(contentLength)
            ? contentLength + startAt
            : startAt;
        const reader = response.body?.getReader();
        if (!reader) throw new Error("The download did not return a readable file.");

        downloadContentTypeRef.current = response.headers.get("content-type") ?? "video/mp4";
        downloadTotalRef.current = total;
        setDownloadState({ status: "downloading", received: startAt, total });

        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!chunk.value) continue;

          downloadChunksRef.current.push(new Blob([chunk.value]));
          downloadReceivedRef.current += chunk.value.byteLength;
          setDownloadState({
            status: "downloading",
            received: downloadReceivedRef.current,
            total: downloadTotalRef.current
          });

          if (downloadReceivedRef.current - downloadLastPersistedRef.current >= 1024 * 1024) {
            await persistDownload(downloadUrl, filename);
            downloadLastPersistedRef.current = downloadReceivedRef.current;
          }
        }

        const blob = new Blob(downloadChunksRef.current, {
          type: downloadContentTypeRef.current
        });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        await removeStoredDownload(downloadStorageKey);
        setDownloadState({ status: "completed" });
      } catch (error) {
        if (controller.signal.aborted) {
          await persistDownload(downloadUrl, filename).catch(() => {});
          setDownloadState({
            status: "paused",
            received: downloadReceivedRef.current,
            total: downloadTotalRef.current
          });
        } else {
          await persistDownload(downloadUrl, filename).catch(() => {});
          setDownloadState({
            status: "error",
            message: error instanceof Error ? error.message : "Download failed."
          });
        }
      } finally {
        if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
      }
    })();
  };

  const downloadProgress =
    downloadState.status === "downloading" || downloadState.status === "paused"
      ? downloadState.total > 0
        ? Math.round((downloadState.received / downloadState.total) * 100)
        : 0
      : null;

  const downloadActionLabel =
    downloadState.status === "downloading"
      ? "Pause download"
      : downloadState.status === "paused"
        ? "Resume download"
        : downloadState.status === "error"
          ? "Retry download"
          : "Download movie";
  const hasDownloadControl = !!downloadUrl || (!localFile && !isScraping);
  const showEpisodePicker = content.type === "tv" && !!onOpenEpisodePicker;
  const batchDownloadProgress =
    batchDownloadState.status === "downloading" && batchDownloadState.total > 0
      ? Math.round(batchDownloadState.progress)
      : null;

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative h-full w-full bg-black flex items-center justify-center select-none overflow-hidden group/custom-player"
    >
      {isScraping && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 ">
          <div className="media-surface rounded-xl p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {localFile ? `Loading ${localFile.name}` : "Loading stream"}
            </p>
          </div>
        </div>
      )}
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
        className={`absolute inset-0 z-30 flex flex-col justify-between bg-linear-to-t from-background/92 via-transparent to-background/50 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="w-full p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl bg-background/65 text-foreground hover:bg-accent"
              onClick={() => navigate(-1)}
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-semibold text-foreground">
                {content.title}
              </h1>
              <p className="truncate text-xs text-foreground/65">
                {content.type === "movie"
                  ? `Movie · ${content.year}`
                  : `TV Series · ${content.year} · S${tvTarget.season} E${tvTarget.episode}`}
              </p>
            </div>

            {(showEpisodePicker || (content.type === "movie" && hasDownloadControl)) && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-2 rounded-xl bg-background/65 text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                onClick={(event) => {
                  event.stopPropagation();
                  if (showEpisodePicker) onOpenEpisodePicker?.();
                  else if (downloadUrl) handleDownload();
                }}
                aria-label={showEpisodePicker ? "Download episodes" : downloadActionLabel}
                title={showEpisodePicker ? "Download episodes" : downloadActionLabel}
              >
                {showEpisodePicker ? (
                  <ListVideo className="w-4 h-4" />
                ) : downloadUrl && downloadState.status === "downloading" ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {showEpisodePicker
                  ? batchDownloadProgress === null
                    ? "Download episodes"
                    : `Downloading · ${batchDownloadProgress}%`
                  : downloadUrl
                    ? downloadProgress === null
                      ? "Download"
                      : `${downloadProgress}%`
                    : "HLS unavailable"}
              </Button>
            )}
          </div>
        </div>

        <div
          className="m-3 w-auto rounded-xl border border-border/60 bg-background/72 p-4 sm:m-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full flex items-center gap-2 group/scrubber">
            <span className="w-12 text-right font-mono text-xs text-foreground/80">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary transition-all group-hover/scrubber:h-2"
            />
            <span className="w-12 text-left font-mono text-xs text-foreground/80">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                className="text-white p-1.5 bg-white/10 rounded-full hover:bg-white/20 h-9 w-9"
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
                <div className="absolute bottom-12 right-0 bg-neutral-950/95 border border-white/10 rounded-lg p-3 w-64 flex flex-col gap-3 shadow-md text-white z-50">
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

      {mediaError && (
        <div className="absolute inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-lg border border-destructive/50 bg-background/95 p-5 text-center sm:inset-x-1/4">
          <p className="font-display font-semibold text-foreground">Video unavailable</p>
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
          className="absolute bottom-24 right-4 z-50 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Skip {isIntro ? "Intro" : "Outro"}
        </Button>
      )}
    </div>
  );
}
