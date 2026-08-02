import { Play, Plus, Check, Star } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useIsInWatchlist,
  useToggleWatchlist,
  type WatchlistSnapshot
} from "@/features/library/useWatchlist";
import { ContentModal } from "./ContentModal";
import { Button, toast } from "@fishy/ui";
import type { PlayHandler } from "@/shared/navigation/watchNavigation";
import type { ContentCard, ContentId, ContentType } from "@content/contentMetadata";

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
  onPlay?: PlayHandler;
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
  const [searchParams, setSearchParams] = useSearchParams();

  const isInWatchlist = useIsInWatchlist(content._id);
  const toggleWatchlist = useToggleWatchlist();
  const didOpenFromUrl = useRef(false);

  useEffect(() => {
    if (didOpenFromUrl.current) return;

    const modalParam = searchParams.get("modal");
    const typeParam = searchParams.get("type");

    if (
      modalParam &&
      content.tmdbId &&
      modalParam === content.tmdbId &&
      typeParam === content.type
    ) {
      didOpenFromUrl.current = true;
      setShowModal(true);
    }
  }, []);

  const handleModalChange = (open: boolean) => {
    setShowModal(open);

    if (open && content.tmdbId) {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.set("modal", content.tmdbId!);
          newParams.set("type", content.type);
          return newParams;
        },
        { replace: true }
      );
    } else {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.delete("modal");
          newParams.delete("type");
          return newParams;
        },
        { replace: true }
      );
    }
  };

  const handleWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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

  return (
    <>
      <div
        className={`group/card isolate relative ${layout === "rail" ? "snap-start shrink-0" : ""} ${widthClass} cursor-pointer select-none`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleModalChange(true);
        }}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleModalChange(true);
          }
        }}
        aria-label={content.year ? `${content.title} (${content.year})` : content.title}
      >
        <div
          className={`relative aspect-2/3 overflow-hidden rounded-xl border border-border/55 bg-card shadow-sm transition-all duration-300 ${
            hoverActive ? "md:z-20 md:shadow-md md:ring-1 md:ring-primary/50" : "shadow-md"
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

          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2">
            {content.new && !hoverActive && (
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground shadow-sm">
                NEW
              </span>
            )}
            {content.type === "tv" &&
              content.seasonNumber &&
              content.episodeNumber &&
              !hoverActive && (
                <span className="ml-auto rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] font-bold text-foreground ">
                  S{content.seasonNumber}·E{content.episodeNumber}
                </span>
              )}
          </div>

          {hasProgress && !hoverActive && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/60">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, content.progress!)}%` }}
              />
            </div>
          )}

          <div
            className={`absolute inset-0 hidden bg-linear-to-t from-background via-background/65 to-transparent md:flex flex-col justify-end p-3 transition-opacity duration-200 ${
              hoverActive ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  onClick={handlePlay}
                  aria-label={`Play ${content.title}`}
                >
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg border-border/80 bg-background/70 hover:bg-accent"
                  onClick={handleWatchlist}
                  aria-label={isInWatchlist ? "Remove from list" : "Add to list"}
                >
                  {isInWatchlist ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-white" />
                  )}
                </Button>
                {score && score > 0 && (
                  <span className="ml-auto flex items-center gap-0.5 text-xs text-foreground/80">
                    <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                    {score.toFixed(1)}
                  </span>
                )}
              </div>

              <h3 className="truncate font-display text-sm font-semibold leading-tight text-foreground">
                {content.title}
              </h3>

              {hasProgress && (
                <div className="media-progress h-0.5">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, content.progress!)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 space-y-2 md:hidden">
          <div>
            <h3 className="line-clamp-1 font-display text-sm font-semibold leading-tight text-foreground">
              {content.title}
            </h3>
            {score && score > 0 && (
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                {score.toFixed(1)}
              </span>
            )}
          </div>

          {showMobileActions && (
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handlePlay}
                aria-label={`Play ${content.title}`}
              >
                <Play className="h-4 w-4 fill-current" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-lg border-border/70 bg-card/80 hover:bg-accent"
                onClick={handleWatchlist}
                aria-label={isInWatchlist ? "Remove from list" : "Add to list"}
              >
                {isInWatchlist ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Plus className="h-4 w-4 text-white" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ContentModal
        content={content}
        isOpen={showModal}
        onClose={() => handleModalChange(false)}
        onPlay={onPlay ?? (() => {})}
      />
    </>
  );
}
