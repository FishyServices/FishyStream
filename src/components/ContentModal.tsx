import { useNavigate } from "react-router-dom";
import { X, Play, Plus, Check, Star, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Doc } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useIsInWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
import { toast } from "sonner";

interface ContentModalProps {
  content: Doc<"content"> | null;
  isOpen: boolean;
  onClose: () => void;
  onPlay: (tmdbId: string) => void;
}

export function ContentModal({ content, isOpen, onClose, onPlay }: ContentModalProps) {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();

  const isInWatchlist = useIsInWatchlist(content?._id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const handleSave = async () => {
    if (!isSignedIn) {
      toast.error("Please sign in to save to watchlist");
      return;
    }
    if (!content) return;

    try {
      if (isInWatchlist) {
        await removeFromWatchlist(content._id);
        toast.success("Removed from My List");
      } else {
        await addToWatchlist(content._id);
        toast.success("Added to My List");
      }
    } catch (e) {
      toast.error("Failed to update watchlist");
    }
  };

  if (!content) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-none">
        <DialogTitle className="sr-only">{content.title}</DialogTitle>

        {/* Hero Image */}
        <div className="relative h-[400px]">
          <img
            src={content.backdropUrl}
            alt={content.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 bg-black/50 text-white hover:bg-black/70 rounded-full"
            onClick={onClose}
          >
            <X className="w-6 h-6" />
          </Button>

          {/* Content Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-center gap-3 mb-4">
              <Badge className="bg-primary text-primary-foreground">
                {content.type === "movie" ? "Movie" : "TV Series"}
              </Badge>
              {content.new && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                  New
                </Badge>
              )}
              {content.trending && (
                <Badge variant="secondary" className="bg-orange-500/20 text-orange-400">
                  Trending
                </Badge>
              )}
            </div>

            <h2 className="text-4xl font-bold text-white mb-4">{content.title}</h2>

            <div className="flex items-center gap-4 text-sm text-white/80 mb-6">
              <span className="text-green-400 font-semibold">{content.rating}</span>
              <span>{content.year}</span>
              {content.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {content.duration}
                </span>
              )}
              {content.seasons && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {content.seasons} Season{content.seasons > 1 ? "s" : ""}
                </span>
              )}
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-400" />
                <span>HD</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button
                size="lg"
                className="bg-white text-black hover:bg-white/90 font-semibold px-8"
                onClick={() => content.tmdbId && onPlay(content.tmdbId)}
              >
                <Play className="w-5 h-5 mr-2 fill-black" />
                Play
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="bg-white/20 text-white hover:bg-white/30 font-semibold"
                onClick={handleSave}
              >
                {isInWatchlist ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    In My List
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 mr-2" />
                    My List
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-8 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">About {content.title}</h3>
            <p className="text-white/70 leading-relaxed">{content.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-white/50">Genres:</span>
              <span className="text-white ml-2">{content.genre.join(", ")}</span>
            </div>
            <div>
              <span className="text-white/50">Type:</span>
              <span className="text-white ml-2 capitalize">{content.type}</span>
            </div>
            {content.imdbId && (
              <div>
                <span className="text-white/50">IMDb:</span>
                <span className="text-white ml-2">{content.imdbId}</span>
              </div>
            )}
            {content.tmdbId && (
              <div>
                <span className="text-white/50">TMDB:</span>
                <span className="text-white ml-2">{content.tmdbId}</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
