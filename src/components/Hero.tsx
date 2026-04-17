import { Play, Info, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Doc } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { ContentModal } from "./ContentModal";

interface HeroProps {
  content: Doc<"content">;
  onPlay?: (tmdbId: string) => void;
}

export function Hero({ content, onPlay }: HeroProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="relative w-full h-[85vh] min-h-[600px]">
      <div className="absolute inset-0">
        <img
          src={content.backdropUrl}
          alt={`${content.title} backdrop`}
          className="w-full h-full object-cover"
          loading="eager"
          decoding="async"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.style.display = "none";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 lg:px-12 pb-16 pt-32">
        <div className="max-w-3xl space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="bg-primary text-primary-foreground font-semibold">
              {content.type === "movie" ? "Movie" : "TV Series"}
            </Badge>
            {content.new && (
              <Badge variant="secondary" className="bg-success-soft text-success border-success/30">
                New Release
              </Badge>
            )}
            {content.trending && (
              <Badge
                variant="secondary"
                className="bg-warning-soft text-warning-foreground border-warning/30"
              >
                Trending #1
              </Badge>
            )}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
            {content.title}
          </h1>

          <div className="flex items-center gap-4 text-sm text-white/80 flex-wrap">
            <span className="text-success font-semibold">{content.rating}</span>
            <span>{content.year}</span>
            {content.duration && <span>{content.duration}</span>}
            {content.seasons && (
              <span>
                {content.seasons} Season{content.seasons > 1 ? "s" : ""}
              </span>
            )}
            <div className="flex gap-1">
              {content.genre.map((g, i) => (
                <span key={g}>
                  {g}
                  {i < content.genre.length - 1 && <span className="mx-1">•</span>}
                </span>
              ))}
            </div>
          </div>

          <p className="text-lg text-white/90 leading-relaxed max-w-2xl line-clamp-3">
            {content.description}
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-semibold px-8"
              onClick={() => content.tmdbId && onPlay?.(content.tmdbId)}
            >
              <Play className="w-5 h-5 mr-2 fill-black" />
              Play
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="bg-white/20 text-white hover:bg-white/30 font-semibold px-8"
              onClick={() => setShowModal(true)}
            >
              <Info className="w-5 h-5 mr-2" />
              More Info
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="bg-white/20 text-white hover:bg-white/30"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      <ContentModal
        content={content}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onPlay={onPlay || (() => {})}
      />
    </div>
  );
}
