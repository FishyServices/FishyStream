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
    <section className="group relative isolate overflow-hidden py-2 pb-6 sm:py-3 sm:pb-8">
      <div className="page-shell-wide relative z-40 mb-4 flex items-center justify-between gap-3">
        <h2 className="truncate text-lg font-semibold text-foreground sm:text-xl" title={title}>
          {title}
        </h2>
        {viewAllHref && (
          <button
            onClick={() => navigate(viewAllHref)}
            className="relative z-40 ml-4 rounded-md px-3 py-2 whitespace-nowrap text-sm text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
          >
            View All →
          </button>
        )}
      </div>

      <div className="page-shell-wide relative pt-2">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 z-50 hidden h-[calc(100%-0.5rem)] w-14 -translate-y-1/2 rounded-r-md border border-l-0 border-border/60 bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background xl:flex group-hover:opacity-100"
          onClick={() => scroll("left")}
          aria-label={`Scroll ${title} left`}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 z-50 hidden h-[calc(100%-0.5rem)] w-14 -translate-y-1/2 rounded-l-md border border-r-0 border-border/60 bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background xl:flex group-hover:opacity-100"
          onClick={() => scroll("right")}
          aria-label={`Scroll ${title} right`}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-4 sm:gap-4 sm:px-0"
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
    </section>
  );
}
