import { useState } from "react";
import { Play, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { TMDBItem, TMDBFullDetail } from "@/hooks/useContent";
import { ContentModal } from "./ContentModal";
import { Button } from "@fishy/ui";
import { TMDB_API_KEY, fetchTmdbFullDetail } from "@fishy/providers/tmdb";
import { buildWatchPath } from "@/lib/watchNavigation";

interface SearchCardProps {
  item: TMDBItem;
  size?: "sm" | "md" | "lg";
  layout?: "rail" | "grid";
  density?: "compact" | "comfortable";
  showMobileActions?: boolean;
}

export function SearchCard({
  item,
  size = "md",
  layout = "rail",
  showMobileActions = true
}: SearchCardProps) {
  const [hovered, setHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [tmdbDetail, setTmdbDetail] = useState<TMDBFullDetail | null | undefined>(undefined);
  const [isResolvingContent, setIsResolvingContent] = useState(false);
  const navigate = useNavigate();

  const apiKey = (import.meta.env.VITE_TMDB_KEY as string | undefined) ?? TMDB_API_KEY;

  const ensureDetail = async () => {
    if (tmdbDetail) return tmdbDetail;
    if (isResolvingContent) return null;
    setIsResolvingContent(true);
    try {
      const result = await fetchTmdbFullDetail(String(item.tmdbId), item.type, apiKey);
      setTmdbDetail(result);
      return result;
    } finally {
      setIsResolvingContent(false);
    }
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(buildWatchPath({ tmdbId: String(item.tmdbId), type: item.type }));
  };

  const handleCardClick = async () => {
    await ensureDetail();
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
          {imgError ? (
            <div className="flex h-full w-full items-center justify-center bg-muted px-3 text-center">
              <span className="line-clamp-3 text-xs font-medium text-muted-foreground">
                {item.title}
              </span>
            </div>
          ) : (
            <img
              src={item.posterUrl}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          )}

          <div
            className={`absolute inset-0 hidden md:flex bg-linear-to-t from-black via-black/60 to-black/10 flex-col justify-end p-3 transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="space-y-2">
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 rounded-md bg-white text-black shadow-sm hover:bg-white/90"
                onClick={handlePlay}
                aria-label={`Play ${item.title}`}
              >
                <Play className="w-4 h-4 fill-black text-black ml-0.5" />
              </Button>

              <h3 className="text-sm font-display font-semibold text-white truncate leading-tight">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span>{item.year}</span>
                {score && score > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                    {score.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 space-y-2 md:hidden">
          <div>
            <h3 className="line-clamp-1 text-sm font-display font-semibold leading-tight text-white">
              {item.title}
            </h3>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/58">
              <span>{item.year}</span>
              {score && score > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                  {score.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {showMobileActions && (
            <Button
              size="icon"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-black hover:bg-white/90"
              onClick={handlePlay}
              aria-label={`Play ${item.title}`}
            >
              <Play className="h-4 w-4 fill-black text-black" />
            </Button>
          )}
        </div>
      </div>

      {showModal && tmdbDetail && (
        <ContentModal
          content={{
            _id: `tmdb:${tmdbDetail.type}:${tmdbDetail.tmdbId}` as import("../../shared/contentMetadata").ContentId,
            title: tmdbDetail.title,
            type: tmdbDetail.type,
            year: tmdbDetail.year,
            posterUrl: tmdbDetail.posterUrl,
            backdropUrl: tmdbDetail.backdropUrl,
            description: tmdbDetail.description,
            rating: tmdbDetail.rating,
            voteAverage: tmdbDetail.voteAverage,
            genre: tmdbDetail.genre,
            tmdbId: tmdbDetail.tmdbId,
            logoUrl: tmdbDetail.logoUrl,
            trailerKey: tmdbDetail.trailerKey,
            duration: tmdbDetail.duration,
            seasons: tmdbDetail.seasons,
            tagline: tmdbDetail.tagline,
            originalLanguage: tmdbDetail.originalLanguage,
            imdbId: tmdbDetail.imdbId,
            totalEpisodes: tmdbDetail.totalEpisodes,
            status: tmdbDetail.status,
            trending: tmdbDetail.trending,
            new: tmdbDetail.isNew
          }}
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onPlay={(tmdbId, season, episode, source, dub, type) =>
            navigate(
              buildWatchPath({
                tmdbId,
                type: type ?? item.type,
                season,
                episode,
                source,
                dub
              })
            )
          }
        />
      )}
    </>
  );
}
