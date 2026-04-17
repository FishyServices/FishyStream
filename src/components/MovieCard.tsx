import { Play, Plus, ThumbsUp, ChevronDown, Check } from "lucide-react";
import { useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useIsInWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
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
}

export function MovieCard({ content, onPlay }: MovieCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { isSignedIn } = useUser();

  const isInWatchlist = useIsInWatchlist(content._id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSignedIn) {
      toast.error("Please sign in to save to watchlist");
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
      toast.error("Failed to update watchlist");
    }
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (content.tmdbId) {
      onPlay?.(
        content.tmdbId,
        content.type === "tv" ? (content.seasonNumber ?? 1) : undefined,
        content.type === "tv" ? (content.episodeNumber ?? 1) : undefined
      );
    }
  };

  const handleModalPlay = (tmdbId: string, season?: number, episode?: number) => {
    onPlay?.(tmdbId, season, episode);
  };

  const handleMoreInfo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowModal(true);
  };

  const hasProgress = content.progress !== undefined && content.progress > 0;

  return (
    <>
      <div
        className="relative flex-shrink-0 w-[160px] sm:w-[200px] lg:w-[240px] cursor-pointer group/card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowModal(true);
          }
        }}
        aria-label={`${content.title} - ${content.year}`}
      >
        <div
          className={`relative aspect-[2/3] rounded-lg overflow-hidden transition-all duration-300 ${
            isHovered ? "scale-105 z-10 shadow-2xl shadow-black/60" : ""
          }`}
        >
          {/* Poster */}
          <img
            src={content.posterUrl}
            alt={content.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                `https://ui-avatars.com/api/?name=${encodeURIComponent(content.title)}&size=500&background=1a1a2e&color=666`;
            }}
          />

          {/* New badge */}
          {!isHovered && content.new && (
            <div className="absolute top-2 right-2">
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded">
                NEW
              </span>
            </div>
          )}

          {/* Season/Episode badge for Continue Watching */}
          {!isHovered && content.type === "tv" && content.seasonNumber && content.episodeNumber && (
            <div className="absolute top-2 left-2">
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary text-white rounded">
                S{content.seasonNumber}E{content.episodeNumber}
              </span>
            </div>
          )}

          {/* Progress bar — always visible when there's progress */}
          {hasProgress && (
            <div className="absolute bottom-0 left-0 right-0">
              <div className="h-1 bg-white/20">
                <div
                  className="h-full bg-primary transition-none"
                  style={{ width: `${Math.min(100, content.progress!)}%` }}
                />
              </div>
            </div>
          )}

          {/* Hover overlay */}
          {isHovered && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3">
              <div className="space-y-2">
                {/* Action buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    className="w-8 h-8 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center shrink-0 transition-colors"
                    onClick={handlePlay}
                    aria-label={`Play ${content.title}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                  </button>
                  <button
                    className="w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/30 border border-white/30 flex items-center justify-center shrink-0 transition-colors"
                    onClick={handleSave}
                    aria-label={isInWatchlist ? "Remove from My List" : "Add to My List"}
                  >
                    {isInWatchlist ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    className="w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/30 border border-white/30 flex items-center justify-center shrink-0 transition-colors ml-auto"
                    onClick={handleMoreInfo}
                    aria-label="More info"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Info */}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate leading-tight">
                    {content.title}
                  </h3>
                  {content.type === "tv" && content.seasonNumber && content.episodeNumber && (
                    <p className="text-[11px] text-primary font-medium mt-0.5">
                      S{content.seasonNumber} E{content.episodeNumber}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-white/60 mt-0.5 flex-wrap">
                    <span className="text-green-400 font-medium">{content.rating}</span>
                    <span>{content.year}</span>
                    {content.seasons ? (
                      <span>{content.seasons}S</span>
                    ) : content.duration ? (
                      <span>{content.duration}</span>
                    ) : null}
                  </div>
                  {content.genre.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {content.genre.slice(0, 2).map((g) => (
                        <span key={g} className="text-[10px] text-white/40 truncate">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress in hover */}
                {hasProgress && (
                  <div className="h-0.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, content.progress!)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ContentModal
        content={content}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onPlay={handleModalPlay}
      />
    </>
  );
}
