import { Play, Plus, ThumbsUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface MovieCardProps {
  content: Doc<"content">;
  onPlay?: (content: Doc<"content">) => void;
}

export function MovieCard({ content, onPlay }: MovieCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 w-[160px] sm:w-[200px] lg:w-[240px] cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onPlay?.(content)}
    >
      <div
        className={`relative aspect-[2/3] rounded-lg overflow-hidden transition-all duration-300 ${
          isHovered ? "scale-105 z-10 shadow-2xl" : ""
        }`}
      >
        <img
          src={content.posterUrl}
          alt={content.title}
          className="w-full h-full object-cover"
        />

        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent flex flex-col justify-end p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  className="w-8 h-8 rounded-full bg-white text-black hover:bg-white/90"
                >
                  <Play className="w-4 h-4 fill-black" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/30 border border-white/30"
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/30 border border-white/30"
                >
                  <ThumbsUp className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/30 border border-white/30 ml-auto"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white line-clamp-1">{content.title}</h3>
                <div className="flex items-center gap-2 text-xs text-white/70 mt-1">
                  <span className="text-green-400">{content.rating}</span>
                  <span>{content.year}</span>
                  {content.duration && <span>{content.duration}</span>}
                  {content.seasons && (
                    <span>
                      {content.seasons} Season{content.seasons > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 mt-1">
                  {content.genre.slice(0, 2).map((g) => (
                    <span key={g} className="text-xs text-white/50">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isHovered && content.new && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 text-xs font-semibold bg-green-500 text-white rounded">
              NEW
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
