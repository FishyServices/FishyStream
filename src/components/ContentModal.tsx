import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Plus,
  Check,
  Star,
  Calendar,
  Clock,
  X,
  ChevronDown,
  Tv,
  Film,
  User,
  Video,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Doc } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
import { useIsInWatchlistGlobal } from "@/hooks/useGlobalWatchlist";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { useContentCredits, useContentVideos, useRelatedContent } from "@/hooks/useContent";

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

function EpisodePill({
  ep,
  selected,
  onClick
}: {
  ep: {
    episodeNumber: number;
    name: string;
    overview?: string;
    stillUrl?: string;
    runtime?: number;
    voteAverage?: number;
  };
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-start gap-3 p-3 rounded-lg text-left transition-all w-full group hover:bg-white/8 ${
        selected ? "bg-white/12 ring-1 ring-primary/50" : ""
      }`}
      onClick={onClick}
    >
      {ep.stillUrl ? (
        <img
          src={ep.stillUrl}
          alt={ep.name}
          className="w-24 h-14 object-cover rounded-md flex-shrink-0 bg-white/5"
          loading="lazy"
        />
      ) : (
        <div className="w-24 h-14 flex-shrink-0 bg-white/5 rounded-md flex items-center justify-center">
          <Tv className="w-5 h-5 text-white/20" />
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold text-white/50">E{ep.episodeNumber}</span>
          {selected && <span className="text-[10px] font-bold text-primary">▶ Playing</span>}
        </div>
        <p className="text-sm font-medium text-white line-clamp-1">{ep.name}</p>
        {ep.overview && <p className="text-xs text-white/50 line-clamp-2 mt-0.5">{ep.overview}</p>}
        {ep.runtime && <p className="text-[11px] text-white/35 mt-1">{ep.runtime}m</p>}
      </div>
      <Play className="w-4 h-4 text-white/0 group-hover:text-white/60 flex-shrink-0 mt-4 transition-colors" />
    </button>
  );
}

export function ContentModal({ content, isOpen, onClose, onPlay }: ContentModalProps) {
  const { isSignedIn } = useUser();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);

  const isInWatchlist = useIsInWatchlistGlobal(content?._id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const dbSeason = useQuery(
    api.seasons.getSeason,
    isOpen && content && content.type === "tv" && content._id
      ? { contentId: content._id, seasonNumber: selectedSeason }
      : "skip"
  );

  const allSeasons = useQuery(
    api.seasons.getSeasonsByContent,
    isOpen && content && content.type === "tv" && content._id ? { contentId: content._id } : "skip"
  );

  const syncSeasons = useAction(api.tmdb.syncSeasons);
  const [isSyncing, setIsSyncing] = useState(false);

  const tmdbIdNum = content?.tmdbId
    ? typeof content.tmdbId === "number"
      ? content.tmdbId
      : parseInt(content.tmdbId, 10) || undefined
    : undefined;
  const contentType = content?.type;

  const { credits } = useContentCredits(tmdbIdNum, contentType, isOpen);
  const { videos } = useContentVideos(tmdbIdNum, contentType, isOpen);
  const { related } = useRelatedContent(tmdbIdNum, contentType, 8, isOpen);

  useEffect(() => {
    if (!content || content.type !== "tv" || !content._id || !content.tmdbId) return;
    if (allSeasons === undefined) return;
    if (allSeasons.length > 0) return;

    const run = async () => {
      setIsSyncing(true);
      try {
        await syncSeasons({
          tmdbId: content.tmdbId!,
          contentId: content._id,
          totalSeasons: content.seasons ?? 1
        });
      } catch {
      } finally {
        setIsSyncing(false);
      }
    };
    run();
  }, [content, allSeasons, syncSeasons]);

  useEffect(() => {
    if (!content) return;
    if (content.type === "tv") {
      setSelectedSeason(content.seasonNumber ?? 1);
      setSelectedEpisode(content.episodeNumber ?? 1);
    }
  }, [content]);

  if (!content) return null;

  const isTV = content.type === "tv";
  const totalSeasons = content.seasons ?? 1;
  const hasSeasonData = dbSeason && dbSeason.episodes.length > 0;
  const episodes = hasSeasonData ? dbSeason.episodes : [];

  const handleWatchlist = async () => {
    if (!isSignedIn) {
      toast.error("Sign in first");
      return;
    }
    try {
      if (isInWatchlist) {
        await removeFromWatchlist(content._id);
        toast.success("Removed from My List");
      } else {
        await addToWatchlist(content._id);
        toast.success("Added to My List");
      }
    } catch {
      toast.error("Failed to update list");
    }
  };

  const handlePlay = (ep?: number) => {
    if (content.tmdbId) {
      onPlay(
        content.tmdbId,
        isTV ? selectedSeason : undefined,
        isTV ? (ep ?? selectedEpisode) : undefined
      );
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-[hsl(220,20%,5%)] border-white/10 max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">{content?.title || "Content Details"}</DialogTitle>
        {/* Hero */}
        <div className="relative h-[280px] sm:h-[340px] flex-shrink-0">
          <img
            src={content.backdropUrl}
            alt={content.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220,20%,5%)] via-[hsl(220,20%,5%)/50] to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,20%,5%)/80] to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full glass border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all z-10"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="absolute top-4 left-4">
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 glass rounded-full border border-white/20 text-white/80">
              {isTV ? <Tv className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
              {isTV ? "TV Series" : "Movie"}
            </span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-6">
            {content.logoUrl ? (
              <img
                src={content.logoUrl}
                alt={content.title}
                className="h-14 w-auto object-contain object-left mb-3"
              />
            ) : (
              <h2 className="font-display text-3xl font-black text-white mb-3 leading-none">
                {content.title}
              </h2>
            )}

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span
                className={`text-xs font-bold rating-${content.rating} border border-current px-2 py-0.5 rounded`}
              >
                {content.rating}
              </span>
              <span className="text-sm text-white/70">{content.year}</span>
              {content.duration && (
                <span className="flex items-center gap-1 text-sm text-white/70">
                  <Clock className="w-3.5 h-3.5" />
                  {content.duration}
                </span>
              )}
              {content.seasons && (
                <span className="flex items-center gap-1 text-sm text-white/70">
                  <Calendar className="w-3.5 h-3.5" />
                  {content.seasons} Season{content.seasons > 1 ? "s" : ""}
                </span>
              )}
              {content.voteAverage && content.voteAverage > 0 && (
                <span className="flex items-center gap-1 text-sm text-yellow-400 font-medium">
                  <Star className="w-3.5 h-3.5 fill-yellow-400" />
                  {content.voteAverage.toFixed(1)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                className="bg-white text-black hover:bg-white/90 font-display font-bold"
                onClick={() => handlePlay()}
              >
                <Play className="w-4 h-4 mr-2 fill-black" />
                {isTV ? `S${selectedSeason} E${selectedEpisode}` : "Play"}
              </Button>
              <Button
                variant="secondary"
                className="glass border-white/20 text-white hover:bg-white/15"
                onClick={handleWatchlist}
              >
                {isInWatchlist ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-400" />
                    In My List
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    My List
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-6 space-y-6">
            <div>
              <p className="text-sm text-white/80 leading-relaxed">{content.description}</p>
              {content.tagline && (
                <p className="text-sm text-white/40 italic mt-2">"{content.tagline}"</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {content.genre.length > 0 && (
                <div>
                  <span className="text-white/40">Genres:</span>
                  <span className="text-white ml-2">{content.genre.slice(0, 4).join(", ")}</span>
                </div>
              )}
              {content.imdbId && (
                <div>
                  <span className="text-white/40">IMDb:</span>
                  <a
                    href={`https://imdb.com/title/${content.imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow-400 hover:text-yellow-300 ml-2 transition-colors"
                  >
                    {content.imdbId}
                  </a>
                </div>
              )}
              {content.status && (
                <div>
                  <span className="text-white/40">Status:</span>
                  <span className="text-white ml-2">{content.status}</span>
                </div>
              )}
              {content.originalLanguage && (
                <div>
                  <span className="text-white/40">Language:</span>
                  <span className="text-white ml-2 uppercase">{content.originalLanguage}</span>
                </div>
              )}
            </div>

            {content.progress !== undefined && content.progress > 0 && (
              <div className="p-3 bg-white/5 rounded-lg border border-white/8">
                <div className="flex justify-between text-xs text-white/60 mb-2">
                  <span>
                    {isTV && content.seasonNumber
                      ? `Season ${content.seasonNumber}, Ep ${content.episodeNumber}`
                      : "Progress"}
                  </span>
                  <span>{Math.round(content.progress)}%</span>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${content.progress}%` }} />
                </div>
              </div>
            )}

            {/* Episodes */}
            {isTV && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-bold text-white">Episodes</h3>
                  {totalSeasons > 1 && (
                    <div className="relative">
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 glass rounded-lg border border-white/20 text-sm text-white hover:bg-white/10 transition-colors"
                        onClick={() => setSeasonMenuOpen(!seasonMenuOpen)}
                      >
                        Season {selectedSeason}
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${seasonMenuOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {seasonMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-[hsl(220,16%,8%)] border border-white/15 rounded-lg shadow-2xl py-1 z-20 max-h-48 overflow-y-auto scrollbar-thin">
                          {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((s) => (
                            <button
                              key={s}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-white/8 transition-colors ${
                                s === selectedSeason
                                  ? "text-primary font-semibold"
                                  : "text-white/80"
                              }`}
                              onClick={() => {
                                setSelectedSeason(s);
                                setSelectedEpisode(1);
                                setSeasonMenuOpen(false);
                              }}
                            >
                              Season {s}
                              {allSeasons?.find((ds) => ds.seasonNumber === s)?.episodeCount && (
                                <span className="text-white/30 ml-2">
                                  ({allSeasons.find((ds) => ds.seasonNumber === s)!.episodeCount}{" "}
                                  ep)
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {dbSeason?.overview && (
                  <p className="text-sm text-white/50 mb-3">{dbSeason.overview}</p>
                )}

                {isSyncing ? (
                  <p className="text-xs text-white/30 text-center py-8">Loading episodes...</p>
                ) : hasSeasonData ? (
                  <div className="space-y-1">
                    {episodes.map((ep) => (
                      <EpisodePill
                        key={ep.episodeNumber}
                        ep={ep}
                        selected={ep.episodeNumber === selectedEpisode}
                        onClick={() => {
                          setSelectedEpisode(ep.episodeNumber);
                          handlePlay(ep.episodeNumber);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/30 text-center py-8">
                    No episode data available.
                  </p>
                )}
              </div>
            )}

            {/* Cast */}
            {credits && credits.cast.length > 0 && (
              <div>
                <h3 className="font-display font-bold text-white mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Cast
                </h3>
                <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-2">
                  {credits.cast.slice(0, 10).map((actor) => (
                    <div key={actor.id} className="flex-shrink-0 w-16 text-center">
                      {actor.profileUrl ? (
                        <img
                          src={actor.profileUrl}
                          alt={actor.name}
                          className="w-16 h-16 object-cover rounded-full bg-white/5 mb-1"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-1">
                          <User className="w-6 h-6 text-white/30" />
                        </div>
                      )}
                      <p className="text-[10px] text-white font-medium line-clamp-2">
                        {actor.name}
                      </p>
                      <p className="text-[9px] text-white/50 line-clamp-1">{actor.character}</p>
                    </div>
                  ))}
                </div>
                {credits.directors.length > 0 && (
                  <p className="text-xs text-white/50 mt-2">
                    <span className="text-white/30">Directed by:</span>{" "}
                    {credits.directors.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Videos */}
            {videos.length > 0 && (
              <div>
                <h3 className="font-display font-bold text-white mb-3 flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Trailers & More
                </h3>
                <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-2">
                  {videos.slice(0, 5).map((video) => (
                    <a
                      key={video.key}
                      href={`https://youtube.com/watch?v=${video.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-40 group"
                    >
                      <div className="relative aspect-video bg-white/5 rounded-lg overflow-hidden mb-1">
                        <img
                          src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                          alt={video.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                          <Play className="w-8 h-8 text-white fill-white drop-shadow-lg" />
                        </div>
                        {video.official && (
                          <span className="absolute top-1 left-1 bg-primary/90 text-[9px] font-bold px-1.5 py-0.5 rounded text-white">
                            OFFICIAL
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white font-medium line-clamp-1 group-hover:text-primary transition-colors">
                        {video.name}
                      </p>
                      <p className="text-[10px] text-white/40">{video.type}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Related */}
            {related.length > 0 && (
              <div>
                <h3 className="font-display font-bold text-white mb-3">More Like This</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {related.map((item) => (
                    <div key={item.tmdbId} className="group cursor-pointer">
                      <div className="aspect-[2/3] bg-white/5 rounded-lg overflow-hidden mb-1.5">
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                      <p className="text-xs text-white font-medium line-clamp-1 group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-white/40">
                        {item.year} • {item.voteAverage?.toFixed(1)} ★
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
