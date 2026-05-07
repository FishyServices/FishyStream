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
  Tv,
  Film,
  User,
  Video,
  Users,
  Loader2
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@fishy/ui";
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
      className={`group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-all hover:bg-accent ${
        selected ? "bg-accent ring-1 ring-primary/40" : ""
      }`}
      onClick={onClick}
    >
      {ep.stillUrl ? (
        <img
          src={ep.stillUrl}
          alt={ep.name}
          className="h-14 w-24 flex-shrink-0 rounded-md bg-muted object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md bg-muted">
          <Tv className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold text-muted-foreground">E{ep.episodeNumber}</span>
          {selected && <span className="text-[10px] font-bold text-primary">▶ Playing</span>}
        </div>
        <p className="line-clamp-1 text-sm font-medium text-foreground">{ep.name}</p>
        {ep.overview && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ep.overview}</p>
        )}
        {ep.runtime && <p className="mt-1 text-[11px] text-muted-foreground/80">{ep.runtime}m</p>}
      </div>
      <Play className="mt-4 h-4 w-4 flex-shrink-0 text-transparent transition-colors group-hover:text-muted-foreground" />
    </button>
  );
}

export function ContentModal({ content, isOpen, onClose, onPlay }: ContentModalProps) {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden border-border/80 bg-card p-0 text-card-foreground">
        <DialogTitle className="sr-only">{content.title}</DialogTitle>

        {/* Hero */}
        <div className="relative h-[280px] sm:h-[340px] flex-shrink-0">
          <img
            src={content.backdropUrl}
            alt={content.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-background/35 to-transparent" />
          <button
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background/78 text-foreground transition-colors hover:bg-background"
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
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/60 text-foreground transition-colors hover:bg-background"
                onClick={handleWatchlist}
                title={isInWatchlist ? "Remove from My List" : "Add to My List"}
              >
                {isInWatchlist ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Plus className="w-5 h-5 text-foreground" />
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
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                {content.year}
              </span>
              {content.duration && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {content.duration}
                </span>
              )}
              <span
                className={`font-semibold text-xs px-2 py-0.5 rounded border border-current rating-${content.rating}`}
              >
                {content.rating}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground/90">
                {isTV ? <Tv className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                {isTV ? `${totalSeasons} Season${totalSeasons > 1 ? "s" : ""}` : "Movie"}
              </span>
            </div>

            {/* Description */}
            {content.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
            )}

            {/* Genre pills */}
            {content.genre.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {content.genre.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Progress */}
            {content.progress !== undefined && content.progress > 0 && (
              <div className="rounded-lg border border-border bg-muted/65 p-3">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {isTV && content.seasonNumber
                      ? `Season ${content.seasonNumber}, Ep ${content.episodeNumber}`
                      : "Progress"}
                  </span>
                  <span>{Math.round(content.progress)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-border/80">
                  <div className="h-full bg-primary" style={{ width: `${content.progress}%` }} />
                </div>
              </div>
            )}

            {/* Episodes */}
            {isTV && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-bold text-foreground">Episodes</h3>
                  {totalSeasons > 1 && (
                    <Select
                      value={String(selectedSeason)}
                      onValueChange={(value) => {
                        const season = Number(value);
                        handleSeasonChange(season);
                        const cachedSeason = allSeasons?.find((ds) => ds.seasonNumber === season);
                        const cachedEpisodes =
                          cachedSeason?.episodeCount || cachedSeason?.episodes.length || 0;
                        const expectedEpisodes = content?.tmdbId
                          ? getCanonicalSeasonEpisodeCount(content.tmdbId, season)
                          : undefined;
                        const needsSync =
                          !cachedSeason ||
                          cachedEpisodes === 0 ||
                          (expectedEpisodes != null && cachedEpisodes !== expectedEpisodes);
                        if (needsSync) {
                          requestSeasonSync(season, { force: true, showLoader: true });
                        }
                      }}
                    >
                      <SelectTrigger className="w-[10rem] border-border/80 bg-background text-foreground">
                        <SelectValue placeholder="Season" />
                      </SelectTrigger>
                      <SelectContent className="border-border/80 bg-popover text-popover-foreground">
                        {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((s) => (
                          <SelectItem key={s} value={String(s)}>
                            Season {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {dbSeason?.overview && (
                  <p className="mb-3 text-sm text-muted-foreground">{dbSeason.overview}</p>
                )}

                {isSyncing && episodes.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Loading episodes…
                  </p>
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
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No episode data available.
                  </p>
                )}
              </div>
            )}

            {/* Cast */}
            {credits && credits.cast.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-foreground">
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
                          className="mb-1 h-16 w-16 rounded-full bg-muted object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <User className="h-6 w-6 text-muted-foreground/60" />
                        </div>
                      )}
                      <p className="line-clamp-2 text-[10px] font-medium text-foreground">
                        {actor.name}
                      </p>
                      <p className="line-clamp-1 text-[9px] text-muted-foreground">
                        {actor.character}
                      </p>
                    </div>
                  ))}
                </div>
                {credits.directors.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="text-muted-foreground/80">Directed by:</span>{" "}
                    {credits.directors.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Videos */}
            {videos.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-foreground">
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
                      <div className="relative mb-1 aspect-video overflow-hidden rounded-lg bg-muted">
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
                      <p className="line-clamp-1 text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                        {video.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{video.type}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Related */}
            {related.length > 0 && (
              <div>
                <h3 className="mb-3 font-display font-bold text-foreground">More Like This</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {related.map((item) => (
                    <div
                      key={item.tmdbId}
                      className="group cursor-pointer"
                      onClick={() => handleRelatedClick(item)}
                    >
                      <div className="mb-1.5 aspect-[2/3] overflow-hidden rounded-lg bg-muted">
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                      <p className="line-clamp-1 text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
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
          <DialogContent className="flex max-w-xs items-center justify-center border-border/80 bg-card p-8 text-card-foreground">
            <DialogTitle className="sr-only">Loading</DialogTitle>
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading {relatedModalItem.title}…</p>
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
