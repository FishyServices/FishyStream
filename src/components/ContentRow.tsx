import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@fishy/ui";
import { MovieCard } from "./MovieCard";
import type { Doc } from "../../convex/_generated/dataModel";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
  watchedAt?: number;
}

interface ContentRowProps {
  title: string;
  content: Array<Doc<"content"> & WatchHistoryFields>;
  onPlay?: (tmdbId: string, season?: number, episode?: number) => void;
  viewAllHref?: string;
}

export function ContentRow({ title, content, onPlay, viewAllHref }: ContentRowProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 600;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  if (content.length === 0) return null;

  return (
    <div className="relative group py-4">
      <div className="mb-4 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-12">
        <h2 className="text-lg sm:text-xl font-semibold text-white truncate" title={title}>
          {title}
        </h2>
        {viewAllHref && (
          <button
            onClick={() => navigate(viewAllHref)}
            className="text-sm text-white/60 hover:text-white transition-colors whitespace-nowrap ml-4"
          >
            View All →
          </button>
        )}
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 hidden md:flex -translate-y-1/2 z-10 w-12 h-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-none"
          onClick={() => scroll("left")}
          aria-label={`Scroll ${title} left`}
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 hidden md:flex -translate-y-1/2 z-10 w-12 h-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-none"
          onClick={() => scroll("right")}
          aria-label={`Scroll ${title} right`}
        >
          <ChevronRight className="w-8 h-8" />
        </Button>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-4 snap-x snap-mandatory sm:gap-4 sm:px-6 lg:px-12"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
        >
          {content.map((item) => (
            <MovieCard key={item._id} content={item} onPlay={onPlay} />
          ))}
        </div>
      </div>
    </div>
  );
}
