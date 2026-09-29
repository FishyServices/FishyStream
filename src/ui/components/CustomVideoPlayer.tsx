import { useEffect, useRef, useState } from "react";
import Artplayer, { type Option, type Setting, type SettingOption } from "artplayer";
import Hls from "hls.js";
import { useNavigate } from "react-router-dom";
import { Download, FastForward, Info, Mic2, MoreHorizontal } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
  Separator
} from "@fishy/ui";
import {
  ProviderSourceSelect,
  type ProviderIdType,
  type ProviderUiMode
} from "@/ui/components/ProviderSourceSelect";
import type { ProviderGroupedSources } from "@fishy/providers/playback";
import { getIntroDbPlaybackSegments } from "@fishy/providers/playback";
import type { ContentPlayback } from "@content/contentMetadata";
import type { PlaybackEvent } from "@/features/playback/usePlaybackSession";
import { useVideoDownloads } from "@/ui/components/custom-video-player/downloads";

interface CustomVideoPlayerProps {
  embedUrl: string;
  resumePositionSeconds?: number;
  localFile?: File;
  content: ContentPlayback;
  tvTarget: { season: number; episode: number };
  getEpisodeEmbedUrl?: (target: { season: number; episode: number }) => Promise<string | null>;
  onOpenEpisodePicker?: () => void;
  downloadRequest?: { season: number; episodes: number[] } | null;
  onDownloadRequestConsumed?: () => void;
  isDub: boolean;
  onPlaybackEvent: (event: PlaybackEvent) => void;
  showDubToggle: boolean;
  handleDubToggle: (isDub: boolean) => void;
  selectedSource: string;
  onSelectProvider: (nextUrl: string, mode: ProviderUiMode) => void;
  providerIdType: ProviderIdType;
  onProviderIdTypeChange: (idType: ProviderIdType) => void;
  groupedSources: ProviderGroupedSources[];
  onInfoClick: () => void;
}

interface SkipSegment {
  start: number;
  end: number;
}
interface SubtitleTrack {
  file: string;
  label?: string;
}
type SubtitleFormat = "vtt" | "srt" | "ass";
interface SubtitleSource {
  url: string;
  name: string;
  type: SubtitleFormat;
}
interface ScrapeResponse {
  streamUrl?: string;
  mediaType?: "hls" | "file";
  tracks?: SubtitleTrack[];
  intro?: SkipSegment;
  outro?: SkipSegment;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTrack(value: unknown): value is SubtitleTrack {
  return isObject(value) && typeof value.file === "string" && value.file.length > 0;
}

function isSegment(value: unknown): value is SkipSegment {
  return (
    isObject(value) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    value.end > value.start
  );
}

function parseScrapeResponse(value: unknown): ScrapeResponse {
  if (!isObject(value)) return {};
  return {
    streamUrl: typeof value.streamUrl === "string" ? value.streamUrl : undefined,
    mediaType:
      value.mediaType === "hls" || value.mediaType === "file" ? value.mediaType : undefined,
    tracks: Array.isArray(value.tracks) ? value.tracks.filter(isTrack) : [],
    intro: isSegment(value.intro) ? value.intro : undefined,
    outro: isSegment(value.outro) ? value.outro : undefined
  };
}

function getResumePosition(embedUrl: string, resume?: number): number {
  if (typeof resume === "number" && resume > 0) return resume;
  try {
    const url = new URL(embedUrl);
    const value = Number(url.searchParams.get("startAt") ?? url.searchParams.get("progress"));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function getOpenSubtitlesEndpoint(): string {
  return "/api/subtitles";
}

function isSubtitleFormat(value: unknown): value is SubtitleFormat {
  return value === "vtt" || value === "srt" || value === "ass";
}

function parseOpenSubtitleSources(value: unknown): SubtitleSource[] {
  if (!isObject(value) || !Array.isArray(value.tracks)) return [];
  return value.tracks.flatMap((track, index) => {
    if (!isObject(track) || typeof track.url !== "string" || typeof track.label !== "string")
      return [];
    return [
      {
        url: track.url,
        name: `${track.label} · OpenSubtitles`,
        type: isSubtitleFormat(track.type) ? track.type : getSubtitleFormat(track.url)
      }
    ];
  });
}

async function getOpenSubtitleSources(
  content: ContentPlayback,
  target: { season: number; episode: number },
  signal: AbortSignal
): Promise<SubtitleSource[]> {
  if (!content.imdbId) return [];
  const endpoint = getOpenSubtitlesEndpoint();
  const params = new URLSearchParams({ imdbId: content.imdbId });
  if (content.type === "tv") {
    params.set("season", String(target.season));
    params.set("episode", String(target.episode));
  }
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, { signal });
    return response.ok ? parseOpenSubtitleSources(await response.json()) : [];
  } catch {
    return [];
  }
}

function getSubtitleFormat(url: string): SubtitleFormat {
  const extension = url.split("?")[0]?.split(".").pop()?.toLowerCase();
  return extension === "srt" || extension === "ass" ? extension : "vtt";
}

export function CustomVideoPlayer({
  embedUrl,
  resumePositionSeconds,
  localFile,
  content,
  tvTarget,
  getEpisodeEmbedUrl,
  onOpenEpisodePicker,
  downloadRequest,
  onDownloadRequestConsumed,
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
  const playerRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const onPlaybackEventRef = useRef(onPlaybackEvent);
  const introDbLookupKeyRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [skipTimes, setSkipTimes] = useState<{ intro?: SkipSegment; outro?: SkipSegment }>({});
  const [showSettings, setShowSettings] = useState(false);
  const {
    downloadUrl,
    downloadState,
    batchDownloadState,
    downloadProgress,
    batchDownloadProgress,
    prepareDownload,
    resetDownload,
    handleDownload
  } = useVideoDownloads({
    contentId: content._id,
    contentTitle: content.title,
    contentType: content.type,
    tvTarget,
    selectedSource,
    localFile,
    downloadReady: !isLoading,
    getEpisodeEmbedUrl,
    downloadRequest,
    onDownloadRequestConsumed
  });

  const prepareDownloadRef = useRef(prepareDownload);
  const resetDownloadRef = useRef(resetDownload);

  useEffect(() => {
    prepareDownloadRef.current = prepareDownload;
    resetDownloadRef.current = resetDownload;
  }, [prepareDownload, resetDownload]);

  useEffect(() => {
    onPlaybackEventRef.current = onPlaybackEvent;
  }, [onPlaybackEvent]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const destroyHls = () => {
      const hls = hlsRef.current;
      hlsRef.current = null;
      if (!hls) return;
      hls.stopLoad();
      hls.destroy();
    };
    const destroy = () => {
      destroyHls();
      playerRef.current?.destroy(false);
      playerRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
    const load = async () => {
      setIsLoading(true);
      setMediaError(null);
      setSkipTimes({});
      resetDownloadRef.current();
      destroy();
      try {
        let url: string;
        let mediaType: "hls" | "file";
        let tracks: SubtitleTrack[] = [];
        if (localFile) {
          url = URL.createObjectURL(localFile);
          objectUrlRef.current = url;
          mediaType = "file";
          prepareDownloadRef.current({ url, mode: "file", persist: false });
        } else {
          const endpoint = import.meta.env.DEV ? "http://localhost:4000/api/scrape" : "/api/scrape";
          const response = await fetch(`${endpoint}?url=${encodeURIComponent(embedUrl)}`, {
            signal: controller.signal
          });
          if (!response.ok) throw new Error("Unable to load the stream.");
          const data = parseScrapeResponse(await response.json());
          if (!data.streamUrl) throw new Error("No playable stream was found.");
          url = data.streamUrl;
          mediaType = data.mediaType ?? (url.includes(".m3u8") ? "hls" : "file");
          tracks = data.tracks ?? [];
          setSkipTimes({ intro: data.intro, outro: data.outro });
          if (mediaType === "hls") prepareDownloadRef.current({ url, mode: "hls", persist: true });
          else {
            const download = new URL(url, window.location.origin);
            download.searchParams.set("download", "1");
            download.searchParams.set(
              "filename",
              `${content.title}${content.type === "tv" ? ` - S${tvTarget.season}E${tvTarget.episode}` : ""}.mp4`
            );
            prepareDownloadRef.current({ url: download.href, mode: "file", persist: true });
          }
        }
        if (!active || !containerRef.current) return;
        const providerSubtitleSources: SubtitleSource[] = tracks.map((track, index) => ({
          url: track.file,
          name: track.label ?? `Subtitle ${index + 1}`,
          type: getSubtitleFormat(track.file)
        }));
        const openSubtitleSources = await getOpenSubtitleSources(
          content,
          tvTarget,
          controller.signal
        );
        const subtitleSources = [...providerSubtitleSources, ...openSubtitleSources];
        const switchSubtitle = (source: SubtitleSource) => {
          const player = playerRef.current;
          if (!player) return;
          void player.subtitle
            .switch(source.url, { name: source.name, type: source.type })
            .then(() => {
              player.subtitle.update({});
              window.setTimeout(() => player.subtitle.update({}), 0);
            })
            .catch((error: unknown) => {
              player.notice.show =
                error instanceof Error ? error.message : "Unable to load subtitles.";
            });
        };
        const subtitleSetting: Setting = {
          name: "subtitles",
          html: "Subtitles",
          onSelect(this: Artplayer, item: SettingOption) {
            if (item.name === "subtitle-off") {
              switchSubtitle({
                url: "data:text/vtt,WEBVTT%0A%0A",
                name: "Off",
                type: "vtt"
              });
              return "Off";
            }
            const selectedSource = subtitleSources.find(
              (_, index) => `subtitle-${index}` === item.name
            );
            if (selectedSource) switchSubtitle(selectedSource);
            return selectedSource?.name ?? "Subtitles";
          },
          selector: [
            {
              name: "subtitle-off",
              html: "Off",
              default: subtitleSources.length === 0
            },
            ...subtitleSources.map((source, index) => ({
              name: `subtitle-${index}`,
              html: source.name,
              default: index === 0
            }))
          ]
        };
        const option: Option = {
          container: containerRef.current,
          url,
          type: mediaType === "hls" ? "m3u8" : "",
          id: `${content._id}:${tvTarget.season}:${tvTarget.episode}`,
          poster: content.posterUrl,
          theme: "var(--color-primary)",
          volume: 0.8,
          autoplay: false,
          autoOrientation: true,
          airplay: true,
          playbackRate: true,
          aspectRatio: true,
          setting: true,
          settings: [subtitleSetting],
          screenshot: true,
          fullscreen: false,
          fullscreenWeb: true,
          hotkey: true,
          lock: true,
          gesture: true,
          fastForward: true,
          miniProgressBar: true,
          subtitleOffset: true,
          mutex: true,
          pip: true,
          autoSize: true,
          cssVar: {
            "--art-font-color": "var(--color-foreground)",
            "--art-background-color": "var(--color-background)",
            "--art-padding": "0.75rem",
            "--art-border-radius": "0.75rem",
            "--art-progress-height": "0.375rem",
            "--art-progress-color": "color-mix(in oklab, var(--color-foreground) 22%, transparent)",
            "--art-loaded-color": "color-mix(in oklab, var(--color-foreground) 42%, transparent)",
            "--art-hover-color": "color-mix(in oklab, var(--color-primary) 45%, transparent)",
            "--art-control-height": "2.75rem",
            "--art-control-icon-size": "2rem",
            "--art-control-opacity": 0.92,
            "--art-bottom-height": "7.5rem",
            "--art-bottom-offset": "0.5rem",
            "--art-widget-background":
              "color-mix(in oklab, var(--color-background) 92%, transparent)",
            "--art-tip-background": "color-mix(in oklab, var(--color-background) 92%, transparent)"
          },
          customType: {
            m3u8(video, sourceUrl) {
              destroyHls();
              if (Hls.isSupported()) {
                const hls = new Hls();
                hlsRef.current = hls;
                hls.loadSource(sourceUrl);
                hls.attachMedia(video);
              } else video.src = sourceUrl;
            }
          },
          moreVideoAttr: { playsInline: true, crossOrigin: "anonymous" }
        };
        const initialSubtitle = subtitleSources[0];
        if (initialSubtitle) option.subtitle = initialSubtitle;
        const player = new Artplayer(option);
        playerRef.current = player;
        const restoreWebFullscreen = () => {
          window.setTimeout(() => {
            if (active && !document.fullscreenElement && !player.isDestroy && !player.fullscreenWeb)
              player.fullscreenWeb = true;
          }, 0);
        };
        document.addEventListener("fullscreenchange", restoreWebFullscreen);
        player.once("destroy", () => {
          document.removeEventListener("fullscreenchange", restoreWebFullscreen);
        });
        player.on("fullscreen", restoreWebFullscreen);
        const report = (event: PlaybackEvent["event"]) => {
          const videoDuration = player.duration;
          onPlaybackEventRef.current({
            event,
            currentTime: player.currentTime,
            duration: videoDuration,
            completed:
              event === "ended" || (videoDuration > 0 && player.currentTime >= videoDuration - 1)
          });
        };
        player.on("ready", () => {
          player.controls.remove("fullscreenWeb");
          player.controls.add({
            name: "fullscreen",
            position: "right",
            index: 70,
            html: "",
            tooltip: "Fullscreen",
            mounted(this: Artplayer, element: HTMLElement) {
              const updateIcon = () => {
                element.replaceChildren(
                  document.fullscreenElement ? this.icons.fullscreenOff : this.icons.fullscreenOn
                );
              };
              updateIcon();
              document.addEventListener("fullscreenchange", updateIcon);
              this.once("destroy", () => {
                document.removeEventListener("fullscreenchange", updateIcon);
              });
            },
            click(this: Artplayer) {
              if (document.fullscreenElement) {
                void document.exitFullscreen();
              } else {
                void document.documentElement.requestFullscreen().catch((error: unknown) => {
                  this.notice.show =
                    error instanceof Error ? error.message : "Unable to enter fullscreen.";
                });
              }
            }
          });
          player.fullscreenWeb = true;
          const resume = getResumePosition(embedUrl, resumePositionSeconds);
          if (resume > 0 && resume < player.duration) player.seek = resume;
          setDuration(player.duration);
          void player.play().catch(() => {});
        });
        player.on("play", () => {
          setIsPlaying(true);
          report("play");
        });
        player.on("pause", () => {
          setIsPlaying(false);
          report("pause");
        });
        player.on("video:ended", () => report("ended"));
        player.on("video:seeked", () => report("seeked"));
        player.on("video:durationchange", () => setDuration(player.duration));
        player.on("video:timeupdate", () => {
          setCurrentTime(player.currentTime);
          setDuration(player.duration);
          report("timeupdate");
        });
        player.on("error", (error) => setMediaError(error.message || "Unable to play this video."));
        if (content.tmdbId && !localFile) {
          player.on("ready", () => {
            const seconds = player.duration;
            if (!Number.isFinite(seconds) || seconds <= 0) return;
            const key = `${content.tmdbId}:${content.type}:${tvTarget.season}:${tvTarget.episode}:${Math.round(seconds)}`;
            if (introDbLookupKeyRef.current === key) return;
            introDbLookupKeyRef.current = key;
            void getIntroDbPlaybackSegments({
              tmdbId: content.tmdbId,
              imdbId: content.imdbId,
              type: content.type,
              season: content.type === "tv" ? tvTarget.season : undefined,
              episode: content.type === "tv" ? tvTarget.episode : undefined,
              durationSeconds: seconds,
              signal: controller.signal
            })
              .then((segments) => {
                if (!active) return;
                const intro = segments.find((segment) => segment.kind === "intro");
                const outro = segments.find(
                  (segment) => segment.kind === "credits" || segment.kind === "preview"
                );
                setSkipTimes({
                  intro: intro ? { start: intro.start, end: intro.end } : undefined,
                  outro: outro ? { start: outro.start, end: outro.end } : undefined
                });
              })
              .catch(() => {});
          });
        }
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError"))
          setMediaError(error instanceof Error ? error.message : "Unable to load this video.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
      destroy();
    };
  }, [
    content._id,
    content.imdbId,
    content.posterUrl,
    content.title,
    content.tmdbId,
    content.type,
    embedUrl,
    localFile,
    resumePositionSeconds,
    tvTarget.episode,
    tvTarget.season
  ]);

  useEffect(() => {
    const flush = () => {
      const player = playerRef.current;
      if (player && player.duration > 0 && player.currentTime > 0)
        onPlaybackEventRef.current({
          event: "pause",
          currentTime: player.currentTime,
          duration: player.duration,
          completed: player.currentTime >= player.duration - 1
        });
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  const skipSegment =
    skipTimes.intro && currentTime >= skipTimes.intro.start && currentTime <= skipTimes.intro.end
      ? skipTimes.intro
      : skipTimes.outro &&
          currentTime >= skipTimes.outro.start &&
          currentTime <= skipTimes.outro.end
        ? skipTimes.outro
        : undefined;
  const skipLabel = skipSegment === skipTimes.intro ? "intro" : "outro";

  return (
    <div className="relative h-auto max-h-[calc(100dvh-10rem)] min-h-0 w-full max-w-full overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/40 ring-1 ring-white/5 aspect-video">
      <div
        ref={containerRef}
        className="artplayer-app absolute inset-0 [&_.art-video-player]:h-full [&_.art-video-player]:w-full [&_.art-video-player]:overflow-hidden"
      />
      {isLoading && (
        <div
          className="absolute inset-0 z-20 grid place-items-center bg-background/75 text-sm text-muted-foreground backdrop-blur-sm"
          role="status"
        >
          Finding a playable stream…
        </div>
      )}
      <div className="absolute right-3 top-3 z-[10001]">
        <Popover open={showSettings} onOpenChange={setShowSettings}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open player actions"
                className="touch-target rounded-full bg-black/55 text-white hover:bg-black/80"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            }
          />
          <PopoverPortal>
            <PopoverPositioner side="bottom" align="end" sideOffset={8}>
              <PopoverContent className="flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto rounded-2xl bg-neutral-950/95 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl">
                <p className="font-display text-sm font-medium">Player actions</p>
                {showDubToggle && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px]">Language</p>
                    <div className="flex rounded-xl bg-white/5 p-0.5">
                      <Button
                        variant={!isDub ? "default" : "ghost"}
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => handleDubToggle(false)}
                      >
                        <Mic2 className="h-3.5 w-3.5" />
                        Sub
                      </Button>
                      <Button
                        variant={isDub ? "default" : "ghost"}
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => handleDubToggle(true)}
                      >
                        <Mic2 className="h-3.5 w-3.5" />
                        Dub
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <p className="text-[13px]">Source</p>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2"
                      disabled={!downloadUrl}
                      onClick={() => handleDownload()}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloadState.status === "downloading"
                        ? `Pause download${downloadProgress === null ? "" : ` · ${downloadProgress}%`}`
                        : downloadState.status === "paused"
                          ? "Resume download"
                          : "Download movie"}
                    </Button>
                  </>
                )}
                {content.type === "tv" && getEpisodeEmbedUrl && (
                  <>
                    <Separator className="bg-white/10" />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={batchDownloadState.status === "downloading"}
                      className="justify-start gap-2"
                      onClick={onOpenEpisodePicker}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {batchDownloadProgress === null
                        ? "Download episodes"
                        : `Downloading episodes · ${batchDownloadProgress}%`}
                    </Button>
                  </>
                )}
                <Separator className="bg-white/10" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start gap-2"
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
      </div>
      {mediaError && (
        <div className="absolute inset-x-4 top-1/2 z-40 -translate-y-1/2 rounded-2xl bg-neutral-950/95 p-7 text-center text-white shadow-2xl ring-1 ring-white/10 sm:inset-x-1/4">
          <p className="text-xs text-destructive">Playback error</p>
          <p className="mt-2 font-display text-lg">Video unavailable</p>
          <p className="mt-2 text-sm text-white/55">{mediaError}</p>
          <Button onClick={() => navigate("/")} className="mt-5 rounded-full">
            Choose another file from Home
          </Button>
        </div>
      )}
      {skipSegment && (
        <Button
          variant="secondary"
          onClick={() => {
            if (playerRef.current) playerRef.current.seek = skipSegment.end;
          }}
          className="absolute bottom-20 right-4 z-30 gap-2 rounded-full bg-white/10 text-white backdrop-blur-xl sm:bottom-24 sm:right-8"
        >
          <span>Skip {skipLabel}</span>
          <FastForward className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
