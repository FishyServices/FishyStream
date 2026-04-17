import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MovieCard } from "./MovieCard";
import type { Doc } from "../../convex/_generated/dataModel";

interface ContentRowProps {
  title: string;
  content: Doc<"content">[];
  onPlay?: (tmdbId: string) => void;
}

export function ContentRow({ title, content, onPlay }: ContentRowProps) {
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
      <h2 className="text-lg sm:text-xl font-semibold text-white mb-4 px-4 sm:px-6 lg:px-12">
        {title}
      </h2>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-none"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-none"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="w-8 h-8" />
        </Button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 pb-4"
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
