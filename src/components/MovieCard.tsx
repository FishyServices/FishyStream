import { Play, Plus, Check, ChevronDown, Star } from "lucide-react";
import { useState } from "react";
import { useIsInWatchlist, useToggleWatchlist, type WatchlistSnapshot } from "@/hooks/useWatchlist";
import { ContentModal } from "./ContentModal";
import { Button, toast } from "@fishy/ui";
import { useUser } from "@clerk/react";
import type { ContentCard, ContentId, ContentType } from "../../shared/contentMetadata";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
  source?: string;
  dub?: boolean;
}

type CardLikeContent = {
  _id: ContentId;
  title: string;
  type: ContentType;
  year?: number;
  posterUrl: string;
  tmdbId?: string;
  voteAverage?: number;
  genre?: string[];
  new?: boolean;
} & WatchHistoryFields;

interface MovieCardProps {
  content: CardLikeContent;
  onPlay?: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: ContentType
  ) => void;
  size?: "sm" | "md" | "lg";
  layout?: "rail" | "grid";
  suppressHoverEffects?: boolean;
  density?: "compact" | "comfortable";
  showMobileActions?: boolean;
}

export function MovieCard({
  content,
  onPlay,
  size = "md",
  layout = "rail",
  suppressHoverEffects = false,
  showMobileActions = true
}: MovieCardProps) {
  const [hovered, setHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const { isSignedIn } = useUser();

  const isInWatchlist = useIsInWatchlist(content._id);
  const toggleWatchlist = useToggleWatchlist();

  const handleWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isSignedIn) {
      toast.error("Sign in to save to your list");
      return;
    }
    try {
      const snapshot: WatchlistSnapshot = {
        title: content.title,
        type: content.type,
        posterUrl: content.posterUrl,
        tmdbId: content.tmdbId ?? content._id.split(":").at(-1) ?? "",
        genre: content.genre,
        year: content.year,
        voteAverage: content.voteAverage
      };
      await toggleWatchlist(content._id, snapshot);
      toast.success(isInWatchlist ? "Removed from My List" : "Added to My List");
    } catch {
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
        content.type === "tv" ? (content.episodeNumber ?? 1) : undefined,
        content.source,
        content.dub,
        content.type
      );
    }
  };

  const widthClass =
    layout === "grid"
      ? "w-full min-w-0"
      : size === "sm"
        ? "w-[38vw] min-w-[130px] max-w-[160px] sm:w-[160px]"
        : size === "lg"
          ? "w-[56vw] min-w-[200px] max-w-[280px] sm:w-[240px] lg:w-[280px]"
          : "w-[42vw] min-w-[148px] max-w-[215px] sm:w-[185px] lg:w-[215px]";

  const hasProgress = content.progress !== undefined && content.progress > 0;
  const score = content.voteAverage;
  const hoverActive = hovered && !suppressHoverEffects;
  const genrePreview = content.genre?.slice(0, 2).join(" · ");

  return (
    <>
      <div
        className={`group/card relative ${layout === "rail" ? "snap-start shrink-0" : ""} ${widthClass} cursor-pointer select-none`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowModal(true);
          }
        }}
        aria-label={content.year ? `${content.title} (${content.year})` : content.title}
      >
        <div
          className={`relative aspect-2/3 rounded-lg overflow-hidden transition-all duration-300 ${
            hoverActive
              ? "md:scale-105 md:z-20 md:shadow-2xl md:shadow-black/70 md:ring-1 md:ring-white/20"
              : "shadow-md"
          }`}
        >
          {imgError ? (
            <div className="flex h-full w-full items-center justify-center bg-muted px-3 text-center">
              <span className="line-clamp-3 text-xs font-medium text-muted-foreground">
                {content.title}
              </span>
            </div>
          ) : (
            <img
              src={content.posterUrl}
              alt={content.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          )}

          {/* Top badges */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2">
            {content.new && !hoverActive && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary text-white rounded-sm">
                NEW
              </span>
            )}
            {content.type === "tv" &&
              content.seasonNumber &&
              content.episodeNumber &&
              !hoverActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-black/70 text-white rounded-sm ml-auto">
                  S{content.seasonNumber}·E{content.episodeNumber}
                </span>
              )}
          </div>

          {/* Progress bar */}
          {hasProgress && !hoverActive && (
            <div className="absolute bottom-0 left-0 right-0 h-0.75 bg-white/20">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, content.progress!)}%` }}
              />
            </div>
          )}

          {/* Hover overlay */}
          <div
            className={`absolute inset-0 hidden md:flex bg-linear-to-t from-black via-black/60 to-black/10 flex-col justify-end p-3 transition-opacity duration-200 ${
              hoverActive ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-md bg-white text-black shadow-sm hover:bg-white/90"
                  onClick={handlePlay}
                  aria-label={`Play ${content.title}`}
                >
                  <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-md border border-white/30 bg-black/55 hover:border-white/60"
                  onClick={handleWatchlist}
                  aria-label={isInWatchlist ? "Remove from list" : "Add to list"}
                >
                  {isInWatchlist ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-white" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8 shrink-0 rounded-md border border-white/30 bg-black/55 hover:border-white/60"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowModal(true);
                  }}
                  aria-label="More info"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-white" />
                </Button>
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
                <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                  {score && score > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                      {score.toFixed(1)}
                    </span>
                  )}
                </div>
                {genrePreview && (
                  <p className="mt-0.5 truncate text-[10px] text-white/40">{genrePreview}</p>
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

        <div className="mt-2.5 space-y-2 md:hidden">
          <div>
            <h3 className="line-clamp-1 text-sm font-display font-semibold leading-tight text-white">
              {content.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/58">
              {score && score > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {score.toFixed(1)}
                </span>
              )}
            </div>
            {content.type === "tv" && content.seasonNumber && content.episodeNumber && (
              <p className="mt-1 text-[11px] font-medium text-primary">
                S{content.seasonNumber} · E{content.episodeNumber}
              </p>
            )}
            {genrePreview && (
              <p className="mt-1 line-clamp-1 text-[10px] text-white/40">{genrePreview}</p>
            )}
          </div>

          {showMobileActions && (
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-black hover:bg-white/90"
                onClick={handlePlay}
                aria-label={`Play ${content.title}`}
                title={`Play ${content.title}`}
              >
                <Play className="h-4 w-4 fill-black text-black" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md border border-white/16 bg-white/6"
                onClick={handleWatchlist}
                aria-label={isInWatchlist ? "Remove from list" : "Add to list"}
                title={isInWatchlist ? "Remove from list" : "Add to list"}
              >
                {isInWatchlist ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Plus className="h-4 w-4 text-white" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md border border-white/16 bg-white/6"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowModal(true);
                }}
                aria-label="More info"
                title="More info"
              >
                <ChevronDown className="h-4 w-4 text-white" />
              </Button>
            </div>
          )}
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
