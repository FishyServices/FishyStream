import { useState, useEffect } from "react";
import { Play, Info, Plus, Check, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Doc } from "../../convex/_generated/dataModel";
import { ContentModal } from "./ContentModal";
import { useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
import { useIsInWatchlistGlobal } from "@/hooks/useGlobalWatchlist";
import { useUser } from "@clerk/react";
import { toast } from "sonner";

interface HeroProps {
  content: Doc<"content">;
  onPlay?: (tmdbId: string) => void;
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

export function Hero({ content, onPlay }: HeroProps) {
  const { isSignedIn } = useUser();
  const [showModal, setShowModal] = useState(false);
  const [muted, setMuted] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isInWatchlist = useIsInWatchlistGlobal(content._id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleWatchlist = async () => {
    if (!isSignedIn) {
      toast.error("Sign in to save to your list");
      return;
    }
    try {
      if (isInWatchlist) {
        await removeFromWatchlist(content._id);
        toast.success("Removed from My List");
      } else {
        await addToWatchlist(content._id);
        toast.success("Added to My List");
      }
    } catch {
      toast.error("Something went wrong");
    }
  };

  const handlePlay = () => content.tmdbId && onPlay?.(content.tmdbId);

  return (
    <div className="relative w-full h-[90vh] min-h-[640px] max-h-[900px] overflow-hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
      >
        {showTrailer && content.trailerKey ? (
          <iframe
            className="absolute inset-0 w-full h-full scale-125"
            src={`https://www.youtube.com/embed/${content.trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${content.trailerKey}&modestbranding=1&showinfo=0`}
            allow="autoplay"
            title="Trailer"
          />
        ) : (
          <img
            src={content.backdropUrl}
            alt={content.title}
            className="w-full h-full object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        )}
      </div>

      {!loaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,20%,8%)] to-[hsl(220,20%,12%)] animate-pulse" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/20" />

      {/* Content */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-6 sm:px-10 lg:px-16 pb-20 transition-all duration-700 ${
          loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="max-w-2xl space-y-4">
          {content.logoUrl ? (
            <img
              src={content.logoUrl}
              alt={content.title}
              className="h-16 sm:h-20 lg:h-24 w-auto object-contain object-left max-w-xs"
            />
          ) : (
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-none tracking-tight">
              {content.title}
            </h1>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border rating-${content.rating} border-current`}
            >
              {content.rating}
            </span>
            <span className="text-sm text-white/70">{content.year}</span>
            {content.duration && <span className="text-sm text-white/70">{content.duration}</span>}
            {content.seasons && (
              <span className="text-sm text-white/70">
                {content.seasons} Season{content.seasons > 1 ? "s" : ""}
              </span>
            )}
            {content.voteAverage && content.voteAverage > 0 && (
              <StarRating score={content.voteAverage} />
            )}
            {content.trending && (
              <span className="text-xs font-semibold text-orange-400 flex items-center gap-1">
                🔥 Trending
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {content.genre.slice(0, 4).map((g) => (
              <span
                key={g}
                className="text-xs px-2.5 py-1 bg-white/10 backdrop-blur rounded-full text-white/80 font-medium"
              >
                {g}
              </span>
            ))}
          </div>

          {content.tagline && (
            <p className="text-base text-white/60 italic font-light">{content.tagline}</p>
          )}
          <p className="text-sm sm:text-base text-white/80 leading-relaxed line-clamp-3 max-w-lg">
            {content.description}
          </p>

          <div className="flex items-center gap-3 flex-wrap pt-2">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-display font-bold px-7 text-base shadow-lg"
              onClick={handlePlay}
            >
              <Play className="w-5 h-5 mr-2 fill-black" />
              Play Now
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="glass text-white hover:bg-white/15 font-semibold px-7 text-base border-white/20"
              onClick={() => setShowModal(true)}
            >
              <Info className="w-5 h-5 mr-2" />
              More Info
            </Button>
            <button
              className="w-11 h-11 rounded-full glass text-white hover:bg-white/15 border border-white/20 flex items-center justify-center transition-all"
              onClick={handleWatchlist}
              title={isInWatchlist ? "Remove from My List" : "Add to My List"}
            >
              {isInWatchlist ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>

            {content.trailerKey && (
              <button
                className="hidden sm:flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors ml-2"
                onClick={() => setShowTrailer(!showTrailer)}
              >
                {showTrailer ? "Hide Trailer" : "Watch Trailer"}
              </button>
            )}

            {showTrailer && content.trailerKey && (
              <button
                className="w-10 h-10 rounded-full glass text-white/60 hover:text-white flex items-center justify-center"
                onClick={() => setMuted(!muted)}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-10 hidden lg:flex flex-col items-center gap-1 text-white/30 animate-bounce">
        <ChevronDown className="w-5 h-5" />
      </div>

      <ContentModal
        content={content}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onPlay={onPlay || (() => {})}
      />
    </div>
  );
}
