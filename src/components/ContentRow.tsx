import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@fishy/ui";
import { MovieCard } from "./MovieCard";
import type { ContentListItem } from "@/hooks/useContent";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
  watchedAt?: number;
  source?: string;
  dub?: boolean;
}

interface ContentRowProps {
  title: string;
  content: Array<ContentListItem & WatchHistoryFields>;
  onPlay?: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean
  ) => void;
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
    <section className="group relative isolate overflow-hidden py-2 pb-8 sm:py-3 sm:pb-10">
      <div className="page-shell-wide relative z-40 mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker mb-2">Shelf</p>
          <h2
            className="truncate font-display text-xl font-bold text-foreground sm:text-2xl"
            title={title}
          >
            {title}
          </h2>
        </div>
        {viewAllHref && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(viewAllHref)}
            className="relative z-40 ml-4 whitespace-nowrap rounded-full border border-white/10 bg-white/3 text-muted-foreground hover:bg-card/80 hover:text-foreground"
          >
            View all
          </Button>
        )}
      </div>

      <div className="page-shell-wide relative pt-2">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 z-50 hidden h-[calc(100%-0.5rem)] w-14 -translate-y-1/2 rounded-r-2xl border border-l-0 border-border/60 bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background xl:flex group-hover:opacity-100"
          onClick={() => scroll("left")}
          aria-label={`Scroll ${title} left`}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 z-50 hidden h-[calc(100%-0.5rem)] w-14 -translate-y-1/2 rounded-l-2xl border border-r-0 border-border/60 bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background xl:flex group-hover:opacity-100"
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
