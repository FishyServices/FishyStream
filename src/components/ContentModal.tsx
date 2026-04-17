import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Check, Star, Calendar, Clock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { Doc } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useIsInWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
import { toast } from "sonner";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
}

interface ContentModalProps {
  content: (Doc<"content"> & WatchHistoryFields) | null;
  isOpen: boolean;
  onClose: () => void;
  onPlay: (tmdbId: string, season?: number, episode?: number) => void;
}

export function ContentModal({ content, isOpen, onClose, onPlay }: ContentModalProps) {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  // Initialize from watch history or defaults
  useEffect(() => {
    if (content?.type === "tv") {
      const initialSeason = content.seasonNumber || 1;
      const initialEpisode = content.episodeNumber || 1;
      setSelectedSeason(initialSeason);
      setSelectedEpisode(initialEpisode);
    }
  }, [content?.type, content?.seasonNumber, content?.episodeNumber]);

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

  const isTV = content.type === "tv";
  const totalSeasons = content.seasons || 1;
  const episodesPerSeason = 24; // Default assumption, ideally this comes from API

  const handlePlay = () => {
    if (content.tmdbId) {
      onPlay(content.tmdbId, isTV ? selectedSeason : undefined, isTV ? selectedEpisode : undefined);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-none">
        <DialogTitle className="sr-only">{content.title}</DialogTitle>

        {/* Hero Image */}
        <div className="relative h-[400px]">
          <img
            src={content.backdropUrl}
            alt={`${content.title} backdrop`}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

          {/* Content Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Badge className="bg-primary text-primary-foreground">
                {content.type === "movie" ? "Movie" : "TV Series"}
              </Badge>
              {/* Current Season/Episode Badge for Continue Watching */}
              {isTV && (
                <Badge className="bg-primary text-primary-foreground font-semibold">
                  S{selectedSeason} E{selectedEpisode}
                </Badge>
              )}
              {content.new && (
                <Badge variant="secondary" className="bg-success-soft text-success">
                  New
                </Badge>
              )}
              {content.trending && (
                <Badge variant="secondary" className="bg-warning-soft text-warning-foreground">
                  Trending
                </Badge>
              )}
            </div>

            <h2 className="text-4xl font-bold text-white mb-4 line-clamp-2">{content.title}</h2>

            <div className="flex items-center gap-4 text-sm text-white/80 mb-6">
              <span className="text-success font-semibold">{content.rating}</span>
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

            {/* Resume Progress Info for Continue Watching */}
            {content.progress !== undefined && content.progress > 0 && (
              <div className="mb-4 p-3 bg-white/10 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/80">
                    {isTV && content.seasonNumber && content.episodeNumber
                      ? `Resume S${content.seasonNumber} E${content.episodeNumber}`
                      : content.completed
                        ? "Completed"
                        : "Continue Watching"}
                  </span>
                  <span className="text-sm text-white/60">
                    {content.completed ? "100%" : `${Math.round(content.progress)}%`}
                  </span>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${content.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Season/Episode Selector for TV Shows */}
            {isTV && totalSeasons > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/70">Season</span>
                  <Select
                    value={String(selectedSeason)}
                    onValueChange={(v) => {
                      setSelectedSeason(Number(v));
                      setSelectedEpisode(1);
                    }}
                  >
                    <SelectTrigger className="w-[100px] bg-white/10 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 max-h-[200px]">
                      {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((s) => (
                        <SelectItem
                          key={s}
                          value={String(s)}
                          className="text-white focus:bg-white/10 focus:text-white"
                        >
                          Season {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/70">Episode</span>
                  <Select
                    value={String(selectedEpisode)}
                    onValueChange={(v) => setSelectedEpisode(Number(v))}
                  >
                    <SelectTrigger className="w-[100px] bg-white/10 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 max-h-[200px]">
                      {Array.from({ length: episodesPerSeason }, (_, i) => i + 1).map((e) => (
                        <SelectItem
                          key={e}
                          value={String(e)}
                          className="text-white focus:bg-white/10 focus:text-white"
                        >
                          Episode {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4">
              <Button
                size="lg"
                className="bg-white text-black hover:bg-white/90 font-semibold px-8"
                onClick={handlePlay}
              >
                <Play className="w-5 h-5 mr-2 fill-black" />
                {isTV ? `Play S${selectedSeason} E${selectedEpisode}` : "Play"}
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
