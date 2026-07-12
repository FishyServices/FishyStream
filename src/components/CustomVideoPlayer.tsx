import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Button } from "@fishy/ui";
import { calculateProgress } from "@fishy/providers/playerProviders";
import {
  normalizePlaybackProgressSample,
  shouldStorePlaybackProgressSample,
} from "@fishy/providers/providerPlayback";
import type { ContentPlayback } from "../../shared/contentMetadata";
import type { PlaybackProgressSample } from "@fishy/providers/providerPlayback";

interface CustomVideoPlayerProps {
  embedUrl: string;
  content: ContentPlayback;
  tvTarget: { season: number; episode: number };
  selectedSourceConfig: any;
  animeContent: boolean;
  isDub: boolean;
  updateProgress: any;
  onProgressChange: (progress: number) => void;
}

function clamp(v: number) {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

export function CustomVideoPlayer({
  embedUrl,
  content,
  tvTarget,
  selectedSourceConfig,
  animeContent,
  isDub,
  updateProgress,
  onProgressChange,
}: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [subtitles, setSubtitles] = useState<any[]>([]);
  const [skipTimes, setSkipTimes] = useState<{
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  }>({});
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);

  const lastStoredProgressSampleRef = useRef<PlaybackProgressSample | undefined>(undefined);
  const realtimeDetectedRef = useRef(false);

  useEffect(() => {
    if (!embedUrl) return;

    let isMounted = true;
    const fetchRawStream = async () => {
      try {
        const scraperEndpoint = import.meta.env.DEV
          ? "http://localhost:4000/api/scrape"
          : "/api/scrape";
        const res = await fetch(`${scraperEndpoint}?url=${encodeURIComponent(embedUrl)}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.streamUrl && videoRef.current) {
          console.log("Successfully extracted raw stream URL via Scraper:", data.streamUrl);

          if (data.tracks) setSubtitles(data.tracks);
          if (data.intro || data.outro) setSkipTimes({ intro: data.intro, outro: data.outro });

          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(data.streamUrl);
            hls.attachMedia(videoRef.current);
          } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = data.streamUrl;
          }
        }
      } catch (e) {
        console.error("Scraper Error:", e);
      }
    };

    fetchRawStream();
    return () => {
      isMounted = false;
    };
  }, [embedUrl]);

  useEffect(() => {
    if (!videoRef.current) return;

    let syncInFlight = false;

    const handleTimeUpdate = () => {
      const video = videoRef.current;
      if (!video || !video.duration) return;

      const currentTime = video.currentTime;
      const duration = video.duration;
      const progress = calculateProgress(currentTime, duration);

      onProgressChange(progress);
      setPlayerCurrentTime(currentTime);

      if (syncInFlight) return;

      const sample = normalizePlaybackProgressSample({
        event: "timeupdate",
        currentTime,
        duration,
        progress,
      });

      if (!shouldStorePlaybackProgressSample(lastStoredProgressSampleRef.current, sample)) return;

      const persistedSeason = content.type === "tv" ? tvTarget.season : undefined;
      const persistedEpisode = content.type === "tv" ? tvTarget.episode : undefined;

      realtimeDetectedRef.current = true;
      syncInFlight = true;

      updateProgress(
        content._id,
        progress,
        progress >= 95 || video.ended,
        currentTime,
        duration,
        persistedSeason,
        persistedEpisode,
        selectedSourceConfig?.name,
        animeContent ? isDub : undefined,
        {
          title: content.title,
          type: content.type,
          posterUrl: content.posterUrl ?? "",
          tmdbId: content.tmdbId ?? content._id.split(":").at(-1) ?? "",
          genre: content.genre,
          year: content.year,
          voteAverage: content.voteAverage,
        }
      );

      lastStoredProgressSampleRef.current = sample;
      syncInFlight = false;
    };

    const handleEnded = () => handleTimeUpdate();

    videoRef.current.addEventListener("timeupdate", handleTimeUpdate);
    videoRef.current.addEventListener("ended", handleEnded);

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener("timeupdate", handleTimeUpdate);
        videoRef.current.removeEventListener("ended", handleEnded);
      }
    };
  }, [
    content,
    tvTarget,
    selectedSourceConfig,
    updateProgress,
    animeContent,
    isDub,
    onProgressChange,
  ]);

  const isIntro =
    skipTimes.intro &&
    playerCurrentTime >= skipTimes.intro.start &&
    playerCurrentTime <= skipTimes.intro.end;
  const isOutro =
    skipTimes.outro &&
    playerCurrentTime >= skipTimes.outro.start &&
    playerCurrentTime <= skipTimes.outro.end;

  return (
    <>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        controls
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

      {/* Skip Intro / Outro Button */}
      {(isIntro || isOutro) && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.currentTime = isIntro
                ? skipTimes.intro!.end
                : skipTimes.outro!.end;
            }
          }}
          className="absolute bottom-24 right-4 z-50 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Skip {isIntro ? "Intro" : "Outro"}
        </Button>
      )}
    </>
  );
}
