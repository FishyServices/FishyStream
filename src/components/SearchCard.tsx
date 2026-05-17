import { useState, useEffect } from "react";
import { Play, Plus, Check, ChevronDown, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { TMDBItem } from "@/hooks/useContent";
import { useIsInWatchlist, useToggleWatchlist } from "@/hooks/useWatchlist";
import { ContentModal } from "./ContentModal";
import { Button, toast } from "@fishy/ui";
import { useUser } from "@clerk/react";
import { useAction, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { ContentDetail } from "../../shared/contentMetadata";

interface SearchCardProps {
  item: TMDBItem;
  size?: "sm" | "md" | "lg";
  layout?: "rail" | "grid";
}

export function SearchCard({ item, size = "md", layout = "rail" }: SearchCardProps) {
  const [hovered, setHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [dbContent, setDbContent] = useState<ContentDetail | null | undefined>(undefined);
  const [isResolvingContent, setIsResolvingContent] = useState(false);
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
  const convex = useConvex();

  const syncSingleContent = useAction(api.tmdb.syncSingleContent);
  const isInWatchlist = useIsInWatchlist(dbContent?._id);
  const toggleWatchlist = useToggleWatchlist();

  const ensureDbContent = async () => {
    if (dbContent) return dbContent;
    if (isResolvingContent) return null;

    setIsResolvingContent(true);
    try {
      let existing = await convex.query(api.content.getContentByTmdbId, {
        tmdbId: String(item.tmdbId)
      });

      if (!existing) {
        await syncSingleContent({ tmdbId: item.tmdbId, type: item.type });
        existing = await convex.query(api.content.getContentByTmdbId, {
          tmdbId: String(item.tmdbId)
        });
      }

      setDbContent(existing);
      return existing;
    } finally {
      setIsResolvingContent(false);
    }
  };

  const handleWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isSignedIn) {
      toast.error("Sign in to save to your list");
      return;
    }

    const content = await ensureDbContent();
    if (!content?._id) {
      toast.error("Failed to load content");
      return;
    }

    try {
      await toggleWatchlist(content._id);
      toast.success(isInWatchlist ? "Removed from My List" : "Added to My List");
    } catch {
      toast.error("Failed to update watchlist");
    }
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/watch/${item.tmdbId}`);
  };

  const handleCardClick = async () => {
    await ensureDbContent();
    setShowModal(true);
  };

  const widthClass =
    layout === "grid"
      ? "w-full min-w-0"
      : size === "sm"
        ? "w-[38vw] min-w-[130px] max-w-[160px] sm:w-[160px]"
        : size === "lg"
          ? "w-[56vw] min-w-[200px] max-w-[280px] sm:w-[240px] lg:w-[280px]"
          : "w-[42vw] min-w-[148px] max-w-[215px] sm:w-[185px] lg:w-[215px]";

  const score = item.voteAverage;

  return (
    <>
      <div
        className={`group/card relative ${layout === "rail" ? "snap-start shrink-0" : ""} ${widthClass} cursor-pointer select-none`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleCardClick}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        aria-label={`${item.title} (${item.year})`}
      >
        <div
          className={`relative aspect-2/3 rounded-lg overflow-hidden transition-all duration-300 ${
            hovered
              ? "md:scale-105 md:z-20 md:shadow-2xl md:shadow-black/70 md:ring-1 md:ring-white/20"
              : "shadow-md"
          }`}
        >
          <img
            src={
              imgError
                ? `https://placehold.co/300x450/1a1a2e/555?text=${encodeURIComponent(item.title.slice(0, 12))}`
                : item.posterUrl
            }
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />

          {/* Hover overlay */}
          <div
            className={`absolute inset-0 hidden md:flex bg-linear-to-t from-black via-black/60 to-black/10 flex-col justify-end p-3 transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  className="w-9 h-9 rounded-full bg-white text-black hover:bg-white/90 shadow-lg shrink-0"
                  onClick={handlePlay}
                  aria-label={`Play ${item.title}`}
                >
                  <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-full border border-white/40 glass shrink-0 hover:border-white/70"
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
                  className="w-8 h-8 rounded-full border border-white/40 glass shrink-0 ml-auto hover:border-white/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick();
                  }}
                  aria-label="More info"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-white" />
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-display font-semibold text-white truncate leading-tight">
                  {item.title}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-white/60">
                  <span>{item.rating}</span>
                  <span>·</span>
                  <span>{item.year}</span>
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
                {item.genre.length > 0 && (
                  <p className="text-[10px] text-white/40 mt-0.5 truncate">
                    {item.genre.slice(0, 2).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5 space-y-2 md:hidden">
          <div>
            <h3 className="line-clamp-1 text-sm font-display font-semibold leading-tight text-white">
              {item.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/58">
              <span>{item.rating}</span>
              <span>{item.year}</span>
              {score && score > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {score.toFixed(1)}
                </span>
              )}
            </div>
            {item.genre.length > 0 && (
              <p className="mt-1 line-clamp-1 text-[10px] text-white/40">
                {item.genre.slice(0, 2).join(" · ")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-white text-black hover:bg-white/90"
              onClick={handlePlay}
              aria-label={`Play ${item.title}`}
            >
              <Play className="h-4 w-4 fill-black text-black" />
              <span className="text-xs font-semibold">Play</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-white/16 bg-white/6"
              onClick={handleWatchlist}
              aria-label={isInWatchlist ? "Remove from list" : "Add to list"}
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
              className="h-9 w-9 rounded-full border border-white/16 bg-white/6"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
              aria-label="More info"
            >
              <ChevronDown className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </div>

      {showModal && dbContent && (
        <ContentModal
          content={dbContent}
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onPlay={(tmdbId, season, episode) => {
            const params = new URLSearchParams();
            if (season !== undefined) params.set("season", String(season));
            if (episode !== undefined) params.set("episode", String(episode));
            const qs = params.toString();
            navigate(`/watch/${tmdbId}${qs ? `?${qs}` : ""}`);
          }}
        />
      )}
    </>
  );
}
