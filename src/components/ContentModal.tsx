import { useState, useEffect, useRef } from "react";
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
  Users,
  Loader2
} from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle } from "@fishy/ui";
import type { Doc } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { useIsInWatchlist, useToggleWatchlist } from "@/hooks/useWatchlist";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "@fishy/ui";
import { useContentCredits, useContentVideos, useRelatedContent } from "@/hooks/useContent";
import type { TMDBItem } from "@/hooks/useContent";
import {
  getCanonicalSeasonCount,
  getCanonicalSeasonEpisodeCount
} from "../../shared/tvSeasonMappings";

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
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);

  const isInWatchlist = useIsInWatchlist(content?._id);
  const toggleWatchlist = useToggleWatchlist();

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

  const syncSeason = useAction(api.tmdb.syncSeason);
  const syncSeasons = useAction(api.tmdb.syncSeasons);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingTv, setIsRefreshingTv] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [episodeLoadError, setEpisodeLoadError] = useState<string | null>(null);
  const [seasonCountOverride, setSeasonCountOverride] = useState<number | undefined>(undefined);
  const refreshedTvKeyRef = useRef<string | null>(null);
  const backgroundSyncKeyRef = useRef<string | null>(null);
  const syncedSeasonKeysRef = useRef(new Set<string>());

  const tmdbIdNum = content?.tmdbId
    ? typeof content.tmdbId === "number"
      ? content.tmdbId
      : parseInt(content.tmdbId, 10) || undefined
    : undefined;
  const { credits } = useContentCredits(tmdbIdNum, content?.type, isOpen);
  const { videos } = useContentVideos(tmdbIdNum, content?.type, isOpen);
  const { related } = useRelatedContent(tmdbIdNum, content?.type, 8, isOpen);

  const syncSingleContent = useAction(api.tmdb.syncSingleContent);
  const [relatedModalItem, setRelatedModalItem] = useState<TMDBItem | null>(null);
  const [relatedDbContent, setRelatedDbContent] = useState<Doc<"content"> | null | undefined>(
    undefined
  );
  const [relatedSyncing, setRelatedSyncing] = useState(false);

  const relatedContentQuery = useQuery(
    api.content.getByTmdbId,
    relatedModalItem ? { tmdbId: String(relatedModalItem.tmdbId) } : "skip"
  );

  useEffect(() => {
    if (relatedContentQuery) {
      setRelatedDbContent(relatedContentQuery);
    }
  }, [relatedContentQuery]);

  const requestSeasonSync = (
    seasonNumber: number,
    options?: { force?: boolean; showLoader?: boolean }
  ) => {
    if (!content || content.type !== "tv" || !content._id || !content.tmdbId) return;

    const seasonKey = `${content._id}:${seasonNumber}`;
    if (options?.force) {
      syncedSeasonKeysRef.current.delete(seasonKey);
    }
    if (syncedSeasonKeysRef.current.has(seasonKey)) return;

    syncedSeasonKeysRef.current.add(seasonKey);
    setEpisodeLoadError(null);
    if (options?.showLoader) {
      setIsSyncing(true);
    }

    void syncSeason({
      tmdbId: String(content.tmdbId),
      contentId: content._id,
      seasonNumber
    })
      .then((result) => {
        if (!result) {
          syncedSeasonKeysRef.current.delete(seasonKey);
          if (selectedSeason === seasonNumber) {
            setEpisodeLoadError(`Couldn't load Season ${seasonNumber}.`);
          }
        }
      })
      .catch(() => {
        syncedSeasonKeysRef.current.delete(seasonKey);
        if (selectedSeason === seasonNumber) {
          setEpisodeLoadError(`Couldn't load Season ${seasonNumber}.`);
        }
      })
      .finally(() => {
        if (options?.showLoader) {
          setIsSyncing(false);
        }
      });
  };

  useEffect(() => {
    if (!content || !isOpen) {
      setEpisodeLoadError(null);
      setSeasonCountOverride(undefined);
      syncedSeasonKeysRef.current.clear();
      backgroundSyncKeyRef.current = null;
    }
  }, [content, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      refreshedTvKeyRef.current = null;
      return;
    }
    if (!content || content.type !== "tv" || !content._id || !content.tmdbId) return;
    const tmdbId = String(content.tmdbId);
    const refreshKey = `${content._id}:${tmdbId}`;
    if (isRefreshingTv || refreshedTvKeyRef.current === refreshKey) return;

    let cancelled = false;
    refreshedTvKeyRef.current = refreshKey;
    setIsRefreshingTv(true);

    syncSingleContent({ tmdbId: Number(tmdbId), type: "tv" })
      .then((refreshed) => {
        if (cancelled) return;
        const totalSeasons = getCanonicalSeasonCount(tmdbId, refreshed?.seasons ?? content.seasons);
        if (refreshed?.seasons != null) {
          setSeasonCountOverride(refreshed.seasons);
        }

        const backgroundSyncKey = `${content._id}:${tmdbId}:${totalSeasons}`;
        if (backgroundSyncKeyRef.current !== backgroundSyncKey) {
          backgroundSyncKeyRef.current = backgroundSyncKey;
          setIsBackgroundSyncing(true);

          void syncSeasons({
            tmdbId,
            contentId: content._id,
            totalSeasons
          })
            .catch(() => {
              if (!cancelled) {
                backgroundSyncKeyRef.current = null;
              }
            })
            .finally(() => {
              if (!cancelled) {
                setIsBackgroundSyncing(false);
              }
            });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsRefreshingTv(false);
      });

    return () => {
      cancelled = true;
    };
  }, [content, isOpen, isRefreshingTv, syncSeasons, syncSingleContent]);

  useEffect(() => {
    if (!content || content.type !== "tv" || !content._id || !content.tmdbId) return;
    if (!isOpen || isRefreshingTv || isBackgroundSyncing || allSeasons === undefined) return;

    const tmdbId = String(content.tmdbId);
    const expectedSeasonCount = getCanonicalSeasonCount(
      tmdbId,
      seasonCountOverride ?? content.seasons
    );
    const syncedSeasonNumbers = new Set(allSeasons.map((season) => season.seasonNumber));
    const hasSeasonShapeMismatch = allSeasons.some((season) => {
      const expectedEpisodes = getCanonicalSeasonEpisodeCount(tmdbId, season.seasonNumber);
      if (expectedEpisodes == null) return false;
      const actualEpisodes = season.episodeCount || season.episodes.length;
      return actualEpisodes !== expectedEpisodes;
    });
    const isSeasonSyncComplete =
      !hasSeasonShapeMismatch &&
      allSeasons.length >= expectedSeasonCount &&
      Array.from({ length: expectedSeasonCount }, (_, index) => index + 1).every((seasonNumber) =>
        syncedSeasonNumbers.has(seasonNumber)
      );

    if (isSeasonSyncComplete) return;

    const backgroundSyncKey = `${content._id}:${tmdbId}:${expectedSeasonCount}`;
    if (backgroundSyncKeyRef.current === backgroundSyncKey) return;

    let cancelled = false;
    backgroundSyncKeyRef.current = backgroundSyncKey;
    setIsBackgroundSyncing(true);

    syncSeasons({
      tmdbId,
      contentId: content._id,
      totalSeasons: expectedSeasonCount
    })
      .catch(() => {
        if (!cancelled) {
          backgroundSyncKeyRef.current = null;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBackgroundSyncing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    allSeasons,
    content,
    isBackgroundSyncing,
    isOpen,
    isRefreshingTv,
    seasonCountOverride,
    syncSeasons
  ]);

  useEffect(() => {
    if (!content || content.type !== "tv" || !content._id || !content.tmdbId) return;
    if (!isOpen || isSyncing) return;

    const seasonKey = `${content._id}:${selectedSeason}`;
    const expectedEpisodes = getCanonicalSeasonEpisodeCount(content.tmdbId, selectedSeason);
    const actualEpisodes = dbSeason ? dbSeason.episodeCount || dbSeason.episodes.length : 0;
    const hasEpisodes = actualEpisodes > 0;
    const hasMismatch =
      expectedEpisodes != null && hasEpisodes && actualEpisodes !== expectedEpisodes;
    const needsSync = !dbSeason || !hasEpisodes || hasMismatch;

    if (!needsSync || syncedSeasonKeysRef.current.has(seasonKey)) return;
    requestSeasonSync(selectedSeason, { showLoader: !hasEpisodes });
  }, [content, dbSeason, isOpen, isSyncing, selectedSeason, syncSeason]);

  const handleRelatedClick = async (item: TMDBItem) => {
    setRelatedModalItem(item);
    setRelatedDbContent(undefined);
    setRelatedSyncing(true);
    try {
      await syncSingleContent({ tmdbId: item.tmdbId, type: item.type });
    } catch {}
    setRelatedSyncing(false);
  };

  const userHasSelectedRef = useRef(false);

  useEffect(() => {
    if (!content) return;
    if (content.type === "tv" && !userHasSelectedRef.current) {
      setSelectedSeason(content.seasonNumber ?? 1);
      setSelectedEpisode(content.episodeNumber ?? 1);
    }
  }, [content]);

  const handleSeasonChange = (season: number) => {
    userHasSelectedRef.current = true;
    setSelectedSeason(season);
    setSelectedEpisode(1);
  };

  const handleEpisodeClick = (ep: number) => {
    userHasSelectedRef.current = true;
    setSelectedEpisode(ep);
  };

  if (!content) return null;

  const isTV = content.type === "tv";
  const totalSeasons = getCanonicalSeasonCount(
    content.tmdbId,
    seasonCountOverride ?? content.seasons
  );
  const episodes = dbSeason?.episodes ?? [];

  const handleWatchlist = async () => {
    if (!isSignedIn) {
      toast.error("Sign in first");
      return;
    }
    try {
      await toggleWatchlist(content._id);
      toast.success(isInWatchlist ? "Removed from My List" : "Added to My List");
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-[hsl(220,20%,5%)] border-white/10 max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">{content.title}</DialogTitle>

        {/* Hero */}
        <div className="relative h-[280px] sm:h-[340px] flex-shrink-0">
          <img
            src={content.backdropUrl}
            alt={content.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220,20%,5%)] via-black/40 to-transparent" />
          <button
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h2 className="font-display text-2xl sm:text-3xl font-black text-white mb-3 leading-tight">
              {content.title}
            </h2>
            <div className="flex items-center gap-3">
              <Button
                className="bg-white text-black hover:bg-white/90 font-semibold"
                onClick={() => handlePlay()}
              >
                <Play className="w-4 h-4 mr-2 fill-black" />
                Play
                {isTV ? ` S${selectedSeason} E${selectedEpisode}` : ""}
              </Button>
              <button
                className="w-10 h-10 rounded-full border-2 border-white/50 glass flex items-center justify-center hover:border-white transition-colors"
                onClick={handleWatchlist}
                title={isInWatchlist ? "Remove from My List" : "Add to My List"}
              >
                {isInWatchlist ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Plus className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 scrollbar-thin">
          <div className="p-5 space-y-6">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {content.voteAverage && content.voteAverage > 0 && (
                <span className="flex items-center gap-1 text-yellow-400 font-semibold">
                  <Star className="w-4 h-4 fill-yellow-400" />
                  {content.voteAverage.toFixed(1)}
                </span>
              )}
              <span className="text-white/60 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {content.year}
              </span>
              {content.duration && (
                <span className="text-white/60 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {content.duration}
                </span>
              )}
              <span
                className={`font-semibold text-xs px-2 py-0.5 rounded border border-current rating-${content.rating}`}
              >
                {content.rating}
              </span>
              <span className="flex items-center gap-1 text-white/40">
                {isTV ? <Tv className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                {isTV ? `${totalSeasons} Season${totalSeasons > 1 ? "s" : ""}` : "Movie"}
              </span>
            </div>

            {/* Description */}
            {content.description && (
              <p className="text-sm text-white/70 leading-relaxed">{content.description}</p>
            )}

            {/* Genre pills */}
            {content.genre.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {content.genre.map((g) => (
                  <span
                    key={g}
                    className="text-xs px-3 py-1 rounded-full bg-white/8 border border-white/10 text-white/60"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Progress */}
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
                                handleSeasonChange(s);
                                setSeasonMenuOpen(false);
                                const cachedSeason = allSeasons?.find(
                                  (ds) => ds.seasonNumber === s
                                );
                                const cachedEpisodes =
                                  cachedSeason?.episodeCount || cachedSeason?.episodes.length || 0;
                                const expectedEpisodes = content?.tmdbId
                                  ? getCanonicalSeasonEpisodeCount(content.tmdbId, s)
                                  : undefined;
                                const needsSync =
                                  !cachedSeason ||
                                  cachedEpisodes === 0 ||
                                  (expectedEpisodes != null && cachedEpisodes !== expectedEpisodes);
                                if (needsSync) {
                                  requestSeasonSync(s, { force: true, showLoader: true });
                                }
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

                {isSyncing && episodes.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-8">Loading episodes…</p>
                ) : episodeLoadError ? (
                  <p className="text-xs text-red-300/80 text-center py-8">{episodeLoadError}</p>
                ) : episodes.length > 0 ? (
                  <div className="space-y-1">
                    {episodes.map((ep) => (
                      <EpisodePill
                        key={ep.episodeNumber}
                        ep={ep}
                        selected={ep.episodeNumber === selectedEpisode}
                        onClick={() => {
                          handleEpisodeClick(ep.episodeNumber);
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
                    <div
                      key={item.tmdbId}
                      className="group cursor-pointer"
                      onClick={() => handleRelatedClick(item)}
                    >
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

      {/* Nested modal for related content */}
      {relatedModalItem && relatedSyncing && (
        <Dialog
          open={true}
          onOpenChange={() => {
            setRelatedModalItem(null);
            setRelatedSyncing(false);
          }}
        >
          <DialogContent className="max-w-xs p-8 bg-[hsl(220,20%,5%)] border-white/10 flex items-center justify-center">
            <DialogTitle className="sr-only">Loading</DialogTitle>
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-white/60">Loading {relatedModalItem.title}…</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {relatedModalItem && relatedDbContent && !relatedSyncing && (
        <ContentModal
          content={relatedDbContent}
          isOpen={true}
          onClose={() => {
            setRelatedModalItem(null);
            setRelatedDbContent(undefined);
          }}
          onPlay={onPlay}
        />
      )}
    </Dialog>
  );
}
