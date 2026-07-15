import { useState, useEffect, useRef } from "react";
import {
  Play,
  Info,
  Plus,
  Check,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Video
} from "lucide-react";
import { Button } from "@fishy/ui";
import { ContentModal } from "./ContentModal";
import { useIsInWatchlist, useToggleWatchlist, type WatchlistSnapshot } from "@/hooks/useWatchlist";
import { useUser } from "@clerk/react";
import { toast } from "@fishy/ui";
import type { PlayHandler } from "@/lib/watchNavigation";
import type { ContentFeatured } from "../../shared/contentMetadata";

interface HeroProps {
  contents: ContentFeatured[];
  onPlay?: PlayHandler;
  autoPlayTrailer?: boolean;
  trailerMuted?: boolean;
}

function StarRating({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 bg-white/20 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-primary rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-white/60">{score.toFixed(1)}</span>
    </div>
  );
}

export function Hero({
  contents,
  onPlay,
  autoPlayTrailer = false,
  trailerMuted = true
}: HeroProps) {
  const { isSignedIn } = useUser();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [muted, setMuted] = useState(trailerMuted);
  const [showTrailer, setShowTrailer] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeContent = contents[currentIndex] || null;

  const isInWatchlist = useIsInWatchlist(activeContent?._id);
  const toggleWatchlist = useToggleWatchlist();

  useEffect(() => {
    setLoaded(false);
    setShowTrailer(false);
    const timer = setTimeout(() => {
      setLoaded(true);
      if (autoPlayTrailer && activeContent?.trailerKey) {
        setShowTrailer(true);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [currentIndex, autoPlayTrailer, activeContent?.trailerKey]);

  useEffect(() => {
    setMuted(trailerMuted);
  }, [trailerMuted, currentIndex]);

  const resetAutoPlay = () => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
    }
    if (contents.length > 1) {
      autoPlayTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % contents.length);
      }, 8000);
    }
  };

  useEffect(() => {
    resetAutoPlay();
    return () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
    };
  }, [contents.length]);

  if (!activeContent) return null;

  const handleWatchlist = async () => {
    try {
      const snapshot: WatchlistSnapshot = {
        title: activeContent.title,
        type: activeContent.type,
        posterUrl: activeContent.posterUrl,
        tmdbId: activeContent.tmdbId ?? activeContent._id.split(":").at(-1) ?? "",
        genre: activeContent.genre,
        year: activeContent.year,
        voteAverage: activeContent.voteAverage
      };
      await toggleWatchlist(activeContent._id, snapshot);
      toast.success(isInWatchlist ? "Removed from My List" : "Added to My List");
    } catch {
      toast.error("Something went wrong");
    }
  };

  const handlePlay = () =>
    activeContent.tmdbId &&
    onPlay?.(
      activeContent.tmdbId,
      activeContent.type === "tv" ? 1 : undefined,
      activeContent.type === "tv" ? 1 : undefined,
      undefined,
      undefined,
      activeContent.type
    );

  const handleTrailerPlay = () => {
    if (activeContent.trailerKey) {
      setShowTrailer(true);
      setMuted(trailerMuted);
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + contents.length) % contents.length);
    resetAutoPlay();
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % contents.length);
    resetAutoPlay();
  };

  const selectIndex = (index: number) => {
    setCurrentIndex(index);
    resetAutoPlay();
  };

  return (
    <div className="group/hero relative h-[68svh] min-h-135 w-full max-h-225 overflow-hidden sm:h-[92vh] sm:min-h-160">
      <div className="absolute inset-0 bg-neutral-950">
        <div
          className={`absolute inset-0 transition-all duration-1000 ease-out scale-100 ${loaded ? "opacity-100" : "opacity-0"}`}
        >
          {showTrailer && activeContent.trailerKey ? (
            <div className="absolute inset-0 w-full h-full scale-125">
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${activeContent.trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=1&loop=1&playlist=${activeContent.trailerKey}&modestbranding=1&showinfo=0`}
                allow="autoplay"
                title="Trailer"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <div className="rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
                  Trailer
                </div>
              </div>
            </div>
          ) : (
            <img
              src={activeContent.backdropUrl}
              alt={activeContent.title}
              className="w-full h-full object-cover"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          )}
        </div>
      </div>

      <div className="absolute inset-0 bg-linear-to-r from-black/95 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-black/20" />

      <div
        className={`absolute bottom-0 left-0 right-0 px-4 pb-16 sm:px-10 sm:pb-24 lg:px-16 transition-all duration-700 ${
          loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="max-w-xl space-y-4 sm:max-w-2xl">
          {activeContent.logoUrl ? (
            <img
              src={activeContent.logoUrl}
              alt={activeContent.title}
              className="h-14 sm:h-20 lg:h-24 w-auto object-contain object-left max-w-[min(18rem,70vw)] sm:max-w-xs transition-transform duration-500 hover:scale-102"
            />
          ) : (
            <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-none tracking-tight">
              {activeContent.title}
            </h1>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border rating-${activeContent.rating} border-current`}
            >
              {activeContent.rating}
            </span>
            <span className="text-sm text-white/70">{activeContent.year}</span>
            {activeContent.duration && (
              <span className="text-sm text-white/70">{activeContent.duration}</span>
            )}
            {activeContent.seasons && (
              <span className="text-sm text-white/70">
                {activeContent.seasons} Season{activeContent.seasons > 1 ? "s" : ""}
              </span>
            )}
            {activeContent.voteAverage && activeContent.voteAverage > 0 && (
              <StarRating score={activeContent.voteAverage} />
            )}
            {activeContent.trending && (
              <span className="text-xs font-semibold text-orange-400 flex items-center gap-1">
                Trending
              </span>
            )}
          </div>

          <div className="hidden flex-wrap gap-2 sm:flex">
            {(activeContent.genre ?? []).slice(0, 2).map((g) => (
              <span
                key={g}
                className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/80"
              >
                {g}
              </span>
            ))}
          </div>

          {activeContent.tagline && (
            <p className="hidden text-sm font-light italic text-white/60 sm:block sm:text-base">
              {activeContent.tagline}
            </p>
          )}
          <p className="hidden max-w-lg line-clamp-2 text-sm leading-relaxed text-white/80 min-[380px]:block sm:text-base">
            {activeContent.description}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2 sm:gap-3">
            <Button
              size="lg"
              className="w-full rounded-md bg-white px-7 text-base font-semibold text-black shadow-sm hover:bg-white/90 sm:w-auto"
              onClick={handlePlay}
            >
              <Play className="w-5 h-5 mr-2 fill-black" />
              Play
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="flex-1 rounded-md border-white/20 bg-black/60 px-5 text-base font-semibold text-white hover:bg-black/80 sm:flex-none sm:px-7"
              onClick={() => setShowModal(true)}
            >
              <Info className="w-5 h-5 mr-2" />
              Details
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 rounded-md border border-white/20 bg-black/55 text-white hover:bg-black/75"
              onClick={handleWatchlist}
              aria-label={isInWatchlist ? "Remove from My List" : "Add to My List"}
              title={isInWatchlist ? "Remove from My List" : "Add to My List"}
            >
              {isInWatchlist ? <Check className="w-5 text-green-400" /> : <Plus className="w-5" />}
            </Button>

            {activeContent.trailerKey && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-md border border-white/20 bg-black/55 text-white/70 hover:bg-black/75 hover:text-white"
                onClick={handleTrailerPlay}
                aria-label="Play trailer"
                title="Play trailer"
              >
                <Video className="h-4 w-4" />
              </Button>
            )}

            {showTrailer && activeContent.trailerKey && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-md border border-white/20 bg-black/55 text-white/70 hover:bg-black/75 hover:text-white"
                onClick={() => setMuted(!muted)}
                aria-label={muted ? "Unmute trailer" : "Mute trailer"}
                title={muted ? "Unmute trailer" : "Mute trailer"}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {contents.length > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handlePrev}
            className="absolute left-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/45 text-white/80 opacity-100 transition-colors hover:bg-black/70 hover:text-white md:opacity-0 md:group-hover/hero:opacity-100 md:focus-visible:opacity-100"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="absolute right-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/45 text-white/80 opacity-100 transition-colors hover:bg-black/70 hover:text-white md:opacity-0 md:group-hover/hero:opacity-100 md:focus-visible:opacity-100"
            aria-label="Next slide"
          >
            <ChevronRight className="w-6 h-6" />
          </Button>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-20">
            {contents.map((_, idx) => (
              <Button
                key={idx}
                type="button"
                variant="ghost"
                onClick={() => selectIndex(idx)}
                className={`h-2 min-h-0 rounded-full p-0 transition-all duration-300 cursor-pointer hover:bg-white/70 ${
                  currentIndex === idx ? "w-6 bg-primary" : "w-2 bg-white/40 hover:bg-white/70"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}

      <ContentModal
        content={activeContent}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onPlay={onPlay || (() => {})}
      />
    </div>
  );
}
