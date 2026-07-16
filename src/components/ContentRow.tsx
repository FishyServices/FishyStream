import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@fishy/ui";
import { MovieCard } from "./MovieCard";
import type { PlayHandler } from "@/lib/watchNavigation";
import type { ContentCard } from "../../shared/contentMetadata";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
  source?: string;
  dub?: boolean;
}

interface ContentRowProps {
  title: string;
  content: Array<ContentCard & WatchHistoryFields>;
  onPlay?: PlayHandler;
  viewAllHref?: string;
  viewAllLabel?: string;
  density?: "compact" | "comfortable";
}

export function ContentRow({
  title,
  content,
  onPlay,
  viewAllHref,
  viewAllLabel = "View all"
}: ContentRowProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -600 : 600,
        behavior: "smooth"
      });
    }
  };

  if (content.length === 0) return null;

  return (
    <section className="group relative isolate overflow-hidden py-3 pb-8 sm:py-4 sm:pb-11">
      <div className="page-shell-wide relative z-40 mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <h2
          className="truncate font-display text-lg font-bold text-foreground sm:text-2xl"
          title={title}
        >
          {title}
        </h2>
        {viewAllHref && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(viewAllHref)}
            className="relative z-40 shrink-0 rounded-full text-xs text-muted-foreground hover:text-foreground"
          >
            {viewAllLabel}
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
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {content.map((item) => (
            <MovieCard key={item._id} content={item} onPlay={onPlay} />
          ))}
        </div>
      </div>
    </section>
  );
}
