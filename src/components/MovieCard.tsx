import { Play, Plus, Check, ChevronDown, Star } from "lucide-react";
import { useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
import { useIsInWatchlistGlobal } from "@/hooks/useGlobalWatchlist";
import { ContentModal } from "./ContentModal";
import { toast } from "sonner";
import { useUser } from "@clerk/react";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
}

interface MovieCardProps {
  content: Doc<"content"> & WatchHistoryFields;
  onPlay?: (tmdbId: string, season?: number, episode?: number) => void;
  size?: "sm" | "md" | "lg";
}

export function MovieCard({ content, onPlay, size = "md" }: MovieCardProps) {
  const [hovered, setHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const { isSignedIn } = useUser();

  const isInWatchlist = useIsInWatchlistGlobal(content._id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const handleWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
    } catch (err) {
      console.error("Watchlist error:", err);
      toast.error("Failed to update watchlist");
    }
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (content.tmdbId) {
      onPlay?.(
        content.tmdbId,
        content.type === "tv" ? (content.seasonNumber ?? 1) : undefined,
        content.type === "tv" ? (content.episodeNumber ?? 1) : undefined
      );
    }
  };

  const widthClass =
    size === "sm"
      ? "w-[130px] sm:w-[160px]"
      : size === "lg"
        ? "w-[200px] sm:w-[240px] lg:w-[280px]"
        : "w-[150px] sm:w-[185px] lg:w-[215px]";

  const hasProgress = content.progress !== undefined && content.progress > 0;
  const score = content.voteAverage;

  return (
    <>
      <div
        className={`relative flex-shrink-0 ${widthClass} cursor-pointer select-none`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setShowModal(true)}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowModal(true);
          }
        }}
        aria-label={`${content.title} (${content.year})`}
      >
        <div
          className={`relative aspect-[2/3] rounded-lg overflow-hidden transition-all duration-300 ${
            hovered ? "scale-105 z-20 shadow-2xl shadow-black/70 ring-1 ring-white/20" : "shadow-md"
          }`}
        >
          <img
            src={
              imgError
                ? `https://placehold.co/300x450/1a1a2e/555?text=${encodeURIComponent(content.title.slice(0, 12))}`
                : content.posterUrl
            }
            alt={content.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />

          {/* Top badges */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2">
            {content.new && !hovered && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary text-white rounded-sm">
                NEW
              </span>
            )}
            {content.type === "tv" && content.seasonNumber && content.episodeNumber && !hovered && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-black/70 text-white rounded-sm ml-auto">
                S{content.seasonNumber}·E{content.episodeNumber}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {hasProgress && !hovered && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, content.progress!)}%` }}
              />
            </div>
          )}

          {/* Hover overlay */}
          <div
            className={`absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10 flex flex-col justify-end p-3 transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 hover:bg-white/90 transition-colors shadow-lg"
                  onClick={handlePlay}
                  aria-label={`Play ${content.title}`}
                >
                  <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                </button>
                <button
                  className="w-8 h-8 rounded-full border border-white/40 glass flex items-center justify-center shrink-0 hover:border-white/70 transition-colors"
                  onClick={handleWatchlist}
                  aria-label={isInWatchlist ? "Remove from list" : "Add to list"}
                >
                  {isInWatchlist ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
                <button
                  className="w-8 h-8 rounded-full border border-white/40 glass flex items-center justify-center shrink-0 ml-auto hover:border-white/70 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModal(true);
                  }}
                  aria-label="More info"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-white" />
                </button>
              </div>

              <div>
                <h3 className="text-sm font-display font-semibold text-white truncate leading-tight">
                  {content.title}
                </h3>
                {content.type === "tv" && content.seasonNumber && content.episodeNumber && (
                  <p className="text-[11px] text-primary font-medium">
                    S{content.seasonNumber} · E{content.episodeNumber}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-white/60">
                  <span className={`font-semibold rating-${content.rating}`}>{content.rating}</span>
                  <span>·</span>
                  <span>{content.year}</span>
                  {score && score > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                        {score.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>
                {content.genre.length > 0 && (
                  <p className="text-[10px] text-white/40 mt-0.5 truncate">
                    {content.genre.slice(0, 2).join(" · ")}
                  </p>
                )}

                {hasProgress && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-white/50 mb-1">
                      <span>{content.completed ? "Completed" : "Continue"}</span>
                      <span>{Math.round(content.progress!)}%</span>
                    </div>
                    <div className="h-0.5 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, content.progress!)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ContentModal
        content={content}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onPlay={onPlay ?? (() => {})}
      />
    </>
  );
}
