import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Check, Star, Clock, X, Tv, Film, User, Loader2 } from "lucide-react";
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
import { useUser } from "@clerk/react";
import { useIsInWatchlist, useToggleWatchlist, type WatchlistSnapshot } from "@/hooks/useWatchlist";
import { toast } from "@fishy/ui";
import {
  useContentCredits,
  useContentVideos,
  useRelatedContent,
  useContentDetail,
  useSeasonEpisodes
} from "@/hooks/useContent";
import type { TMDBItem } from "@/hooks/useContent";
import { getCanonicalSeasonCount } from "@fishy/providers/tvSeasonMappings";
import type { PlayHandler } from "@/lib/watchNavigation";
import type { ContentDetail, ContentId, ContentType } from "../../shared/contentMetadata";

interface WatchHistoryFields {
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
}

type LeanModalContent = {
  _id: ContentId;
  title: string;
  type: ContentType;
  year?: number;
  posterUrl: string;
  tmdbId?: string;
  voteAverage?: number;
  genre?: string[];
  new?: boolean;
} & WatchHistoryFields;

type ModalContent = (ContentDetail | LeanModalContent) & WatchHistoryFields;

interface ContentModalProps {
  content: ModalContent | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "episodes" | "cast" | "videos" | "related";
  compactCopy?: boolean;
  onPlay: PlayHandler;
}

function hasFullContent(
  content: ModalContent | null
): content is ContentDetail & WatchHistoryFields {
  return !!content && "description" in content && "backdropUrl" in content;
}

function getSeasonCount(content: ModalContent | null): number | undefined {
  const candidate = content as Partial<ContentDetail> | null;
  return typeof candidate?.seasons === "number" ? candidate.seasons : undefined;
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
    <Button
      variant="ghost"
      className={`group flex w-full items-start gap-3 rounded-lg p-3 text-left h-auto justify-start ${
        selected ? "bg-accent ring-1 ring-primary/40" : ""
      }`}
      onClick={onClick}
    >
      {ep.stillUrl ? (
        <img
          src={ep.stillUrl}
          alt={ep.name}
          className="h-14 w-24 shrink-0 rounded-md bg-muted object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-muted">
          <Tv className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">E{ep.episodeNumber}</span>
          {selected && <span className="text-[10px] font-bold text-primary">▶ Playing</span>}
        </div>
        <p className="line-clamp-1 text-sm font-medium text-foreground">{ep.name}</p>
        {ep.overview && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ep.overview}</p>
        )}
        {ep.runtime && <p className="mt-1 text-[11px] text-muted-foreground/80">{ep.runtime}m</p>}
      </div>
      <Play className="mt-4 h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground" />
    </Button>
  );
}

export function ContentModal({
  content,
  isOpen,
  onClose,
  onPlay,
  initialTab,
  compactCopy = true
}: ContentModalProps) {
  const [activeTab, setActiveTab] = useState<"episodes" | "cast" | "videos" | "related">(
    initialTab ?? "episodes"
  );

  const tmdbDetailEnabled = isOpen && !!content && !!content.tmdbId && !hasFullContent(content);
  const { detail: tmdbDetail } = useContentDetail(
    tmdbDetailEnabled ? content?.tmdbId : undefined,
    tmdbDetailEnabled ? content?.type : undefined,
    tmdbDetailEnabled
  );

  const fullContent: ContentDetail | null | undefined = tmdbDetail
    ? ({
        _id: content!._id,
        title: tmdbDetail.title,
        type: tmdbDetail.type,
        year: tmdbDetail.year,
        posterUrl: tmdbDetail.posterUrl,
        backdropUrl: tmdbDetail.backdropUrl,
        description: tmdbDetail.description,
        rating: tmdbDetail.rating,
        voteAverage: tmdbDetail.voteAverage,
        genre: tmdbDetail.genre,
        tmdbId: tmdbDetail.tmdbId,
        logoUrl: tmdbDetail.logoUrl,
        trailerKey: tmdbDetail.trailerKey,
        duration: tmdbDetail.duration,
        seasons: tmdbDetail.seasons,
        tagline: tmdbDetail.tagline,
        originalLanguage: tmdbDetail.originalLanguage,
        imdbId: tmdbDetail.imdbId,
        totalEpisodes: tmdbDetail.totalEpisodes,
        status: tmdbDetail.status,
        trending: tmdbDetail.trending,
        new: tmdbDetail.isNew
      } as ContentDetail)
    : tmdbDetail;

  const resolvedContent: ModalContent | null = fullContent
    ? { ...fullContent, ...content, _id: fullContent._id }
    : content;

  const detailContent = hasFullContent(resolvedContent) ? resolvedContent : null;
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  const isInWatchlist = useIsInWatchlist(resolvedContent?._id);
  const toggleWatchlist = useToggleWatchlist();
  const { season: tmdbSeason, isLoading: tmdbSeasonLoading } = useSeasonEpisodes(
    isOpen && resolvedContent?.type === "tv" ? resolvedContent?.tmdbId : undefined,
    selectedSeason,
    isOpen && resolvedContent?.type === "tv"
  );

  const dbSeason = useMemo(() => {
    const raw = tmdbSeason ?? undefined;
    if (!raw) return raw;
    return raw;
  }, [tmdbSeason]);

  const knownSeasonsFromTmdb = resolvedContent ? getSeasonCount(resolvedContent) : undefined;
  const [episodeLoadError, setEpisodeLoadError] = useState<string | null>(null);
  const [seasonCountOverride, setSeasonCountOverride] = useState<number | undefined>(undefined);

  const tmdbIdNum = resolvedContent?.tmdbId
    ? typeof resolvedContent.tmdbId === "number"
      ? resolvedContent.tmdbId
      : parseInt(resolvedContent.tmdbId, 10) || undefined
    : undefined;
  const { credits } = useContentCredits(
    tmdbIdNum,
    resolvedContent?.type,
    isOpen && activeTab === "cast"
  );
  const { videos } = useContentVideos(
    tmdbIdNum,
    resolvedContent?.type,
    isOpen && activeTab === "videos"
  );
  const { related } = useRelatedContent(
    tmdbIdNum,
    resolvedContent?.type,
    8,
    isOpen && activeTab === "related"
  );

  const [relatedModalItem, setRelatedModalItem] = useState<TMDBItem | null>(null);
  const [relatedDbContent, setRelatedDbContent] = useState<ContentDetail | null | undefined>(
    undefined
  );

  const knownSeasonCount = getSeasonCount(resolvedContent);

  const { detail: relatedTmdbDetail } = useContentDetail(
    relatedModalItem ? String(relatedModalItem.tmdbId) : undefined,
    relatedModalItem?.type,
    !!relatedModalItem
  );

  const relatedSyncing = !!relatedModalItem && relatedTmdbDetail === undefined;

  useEffect(() => {
    if (!relatedModalItem) {
      setRelatedDbContent(undefined);
      return;
    }
    if (relatedTmdbDetail === undefined) return;
    if (!relatedTmdbDetail) {
      setRelatedDbContent(null);
      return;
    }
    setRelatedDbContent({
      _id: `tmdb:${relatedTmdbDetail.type}:${relatedTmdbDetail.tmdbId}` as ContentId,
      title: relatedTmdbDetail.title,
      type: relatedTmdbDetail.type,
      year: relatedTmdbDetail.year,
      posterUrl: relatedTmdbDetail.posterUrl,
      backdropUrl: relatedTmdbDetail.backdropUrl,
      description: relatedTmdbDetail.description,
      rating: relatedTmdbDetail.rating,
      voteAverage: relatedTmdbDetail.voteAverage,
      genre: relatedTmdbDetail.genre,
      tmdbId: relatedTmdbDetail.tmdbId,
      logoUrl: relatedTmdbDetail.logoUrl,
      trailerKey: relatedTmdbDetail.trailerKey,
      duration: relatedTmdbDetail.duration,
      seasons: relatedTmdbDetail.seasons,
      tagline: relatedTmdbDetail.tagline,
      originalLanguage: relatedTmdbDetail.originalLanguage,
      imdbId: relatedTmdbDetail.imdbId,
      totalEpisodes: relatedTmdbDetail.totalEpisodes,
      status: relatedTmdbDetail.status,
      trending: relatedTmdbDetail.trending,
      new: relatedTmdbDetail.isNew
    } as ContentDetail);
  }, [relatedTmdbDetail, relatedModalItem]);

  useEffect(() => {
    if (!isOpen) {
      setEpisodeLoadError(null);
      setSeasonCountOverride(undefined);
    }
  }, [resolvedContent, isOpen]);

  useEffect(() => {
    if (isOpen && resolvedContent) {
      setActiveTab(initialTab ?? (resolvedContent.type === "tv" ? "episodes" : "cast"));
    }
  }, [initialTab, isOpen, resolvedContent?.type]);

  const handleRelatedClick = (item: TMDBItem) => {
    setRelatedModalItem(item);
    setRelatedDbContent(undefined);
  };

  const userHasSelectedRef = useRef(false);

  useEffect(() => {
    if (!resolvedContent) return;
    if (resolvedContent.type === "tv" && !userHasSelectedRef.current) {
      setSelectedSeason(resolvedContent.seasonNumber ?? 1);
      setSelectedEpisode(resolvedContent.episodeNumber ?? 1);
    }
  }, [resolvedContent]);

  useEffect(() => {
    if (isOpen && resolvedContent?.type === "tv") {
      userHasSelectedRef.current = false;
    }
  }, [isOpen, resolvedContent?._id]);

  const handleSeasonChange = (season: number) => {
    userHasSelectedRef.current = true;
    setSelectedSeason(season);
    setSelectedEpisode(1);
  };

  const handleEpisodeClick = (ep: number) => {
    userHasSelectedRef.current = true;
    setSelectedEpisode(ep);
  };

  if (!resolvedContent) return null;

  const isHydratingContent = isOpen && !hasFullContent(content) && fullContent === undefined;
  const contentData = resolvedContent;
  const heroImageUrl =
    detailContent?.backdropUrl ?? ("posterUrl" in contentData ? contentData.posterUrl : undefined);

  const isTV = contentData.type === "tv";
  const totalSeasons = getCanonicalSeasonCount(
    contentData.tmdbId,
    seasonCountOverride ?? knownSeasonCount ?? knownSeasonsFromTmdb
  );
  const episodes = dbSeason?.episodes ?? [];
  const ratingLabel: string | undefined = detailContent?.rating;

  const handleWatchlist = async () => {
    try {
      const snapshot: WatchlistSnapshot = {
        title: contentData.title,
        type: contentData.type,
        posterUrl: contentData.posterUrl,
        tmdbId: contentData.tmdbId ?? contentData._id.split(":").at(-1) ?? "",
        genre: contentData.genre,
        year: contentData.year,
        voteAverage: contentData.voteAverage
      };
      await toggleWatchlist(contentData._id, snapshot);
      toast.success(isInWatchlist ? "Removed from My List" : "Added to My List");
    } catch {
      toast.error("Failed to update list");
    }
  };

  const handlePlay = (ep?: number) => {
    if (contentData.tmdbId) {
      onClose();
      onPlay(
        contentData.tmdbId,
        isTV ? selectedSeason : undefined,
        isTV ? (ep ?? selectedEpisode) : undefined,
        undefined,
        undefined,
        contentData.type
      );
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="z-1001 flex max-h-[90vh] max-w-3xl flex-col overflow-hidden border-border/80 bg-card p-0 text-card-foreground">
        <DialogTitle className="sr-only">{contentData.title}</DialogTitle>

        <div className="relative h-70 shrink-0 sm:h-85">
          {isHydratingContent && !heroImageUrl ? (
            <div className="flex h-full w-full items-center justify-center bg-muted/60">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : heroImageUrl ? (
            <img
              src={heroImageUrl}
              alt={contentData.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/60">
              <Film className="h-10 w-10 text-muted-foreground/60" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-card via-background/35 to-transparent" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-10 h-9 w-9 rounded-md border border-border/80 bg-background/78 text-foreground hover:bg-background"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h2 className="mb-3 font-display text-2xl font-black leading-tight text-white sm:text-3xl">
              {contentData.title}
            </h2>
            <div className="flex items-center gap-3">
              <Button
                className="rounded-md bg-white font-semibold text-black hover:bg-white/90"
                onClick={() => handlePlay()}
              >
                <Play className="mr-2 h-4 w-4 fill-black" />
                {contentData.progress && contentData.progress > 0 ? "Resume" : "Play"}
                {isTV ? ` S${selectedSeason} E${selectedEpisode}` : ""}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="flex h-10 w-10 rounded-md border border-border/80 bg-background/60 text-foreground hover:bg-background"
                onClick={handleWatchlist}
                aria-label={isInWatchlist ? "Remove from My List" : "Add to My List"}
              >
                {isInWatchlist ? (
                  <Check className="h-5 w-5 text-green-400" />
                ) : (
                  <Plus className="h-5 w-5 text-foreground" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="space-y-6 p-5">
            {isHydratingContent && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Loading
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {contentData.voteAverage && contentData.voteAverage > 0 && (
                <span className="flex items-center gap-1 font-semibold text-yellow-400">
                  <Star className="h-4 w-4 fill-yellow-400" />
                  {contentData.voteAverage.toFixed(1)}
                </span>
              )}

              {detailContent?.duration && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {detailContent.duration}
                </span>
              )}
              {ratingLabel && (
                <span
                  className={`rounded border border-current px-2 py-0.5 text-xs font-semibold rating-${ratingLabel}`}
                >
                  {ratingLabel}
                </span>
              )}
              <span className="flex items-center gap-1 text-muted-foreground/90">
                {isTV ? <Tv className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                {isTV ? `${totalSeasons} Season${totalSeasons > 1 ? "s" : ""}` : "Movie"}
              </span>
            </div>

            {detailContent?.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {compactCopy ? detailContent.description.slice(0, 360) : detailContent.description}
              </p>
            )}

            {(contentData.genre?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {(contentData.genre ?? []).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {contentData.progress !== undefined && contentData.progress > 0 && (
              <div className="rounded-lg border border-border bg-muted/65 p-3">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {isTV && contentData.seasonNumber
                      ? `Season ${contentData.seasonNumber}, Ep ${contentData.episodeNumber}`
                      : "Progress"}
                  </span>
                  <span>{Math.round(contentData.progress)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-border/80">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${contentData.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-1 border-b border-border/60">
              {isTV && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveTab("episodes")}
                  className={`-mb-px h-auto rounded-none border-b-2 bg-transparent px-3 py-2 text-sm font-medium transition-colors hover:bg-transparent ${
                    activeTab === "episodes"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Episodes
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("cast")}
                className={`-mb-px h-auto rounded-none border-b-2 bg-transparent px-3 py-2 text-sm font-medium transition-colors hover:bg-transparent ${
                  activeTab === "cast"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Cast
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("videos")}
                className={`-mb-px h-auto rounded-none border-b-2 bg-transparent px-3 py-2 text-sm font-medium transition-colors hover:bg-transparent ${
                  activeTab === "videos"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Trailers
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("related")}
                className={`-mb-px h-auto rounded-none border-b-2 bg-transparent px-3 py-2 text-sm font-medium transition-colors hover:bg-transparent ${
                  activeTab === "related"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Related
              </Button>
            </div>

            {activeTab === "episodes" && isTV && (
              <div>
                {totalSeasons > 1 && (
                  <div className="mb-4">
                    <Select
                      value={String(selectedSeason)}
                      onValueChange={(value) => {
                        const season = Number(value);
                        handleSeasonChange(season);
                        setEpisodeLoadError(null);
                      }}
                    >
                      <SelectTrigger className="w-40 border-border/80 bg-background text-foreground">
                        <SelectValue placeholder="Season">{`Season ${selectedSeason}`}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="border-border/80 bg-popover text-popover-foreground">
                        {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((s) => (
                          <SelectItem key={s} value={String(s)}>
                            Season {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {dbSeason?.overview && (
                  <p className="mb-3 text-sm text-muted-foreground">{dbSeason.overview}</p>
                )}

                {tmdbSeasonLoading && episodes.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Loading episodes</p>
                ) : episodeLoadError ? (
                  <p className="py-8 text-center text-xs text-red-300/80">{episodeLoadError}</p>
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
                  <p className="py-8 text-center text-xs text-muted-foreground">No episodes</p>
                )}
              </div>
            )}

            {activeTab === "cast" && (
              <div>
                {!credits ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : credits.cast.length > 0 ? (
                  <>
                    <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
                      {credits.cast.slice(0, 10).map((actor) => (
                        <div key={actor.id} className="w-16 shrink-0 text-center">
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
                        <span className="text-muted-foreground/80">Directed by</span>{" "}
                        {credits.directors.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">No cast</p>
                )}
              </div>
            )}

            {activeTab === "videos" && (
              <div>
                {videos.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No trailers</p>
                ) : (
                  <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
                    {videos.slice(0, 5).map((video) => (
                      <a
                        key={video.key}
                        href={`https://youtube.com/watch?v=${video.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group w-40 shrink-0"
                      >
                        <div className="relative mb-1 aspect-video overflow-hidden rounded-lg bg-muted">
                          <img
                            src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                            alt={video.name}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10">
                            <Play className="h-8 w-8 fill-white text-white drop-shadow-lg" />
                          </div>
                        </div>
                        <p className="line-clamp-1 text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                          {video.name}
                        </p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "related" && (
              <div>
                {related.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No related titles
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {related.map((item) => (
                      <div
                        key={item.tmdbId}
                        className="group cursor-pointer"
                        onClick={() => handleRelatedClick(item)}
                      >
                        <div className="mb-1.5 aspect-2/3 overflow-hidden rounded-lg bg-muted">
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <p className="line-clamp-1 text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.year} · {item.voteAverage?.toFixed(1)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {relatedModalItem && relatedSyncing && (
        <Dialog
          open={true}
          onOpenChange={() => {
            setRelatedModalItem(null);
          }}
        >
          <DialogContent className="z-1001 flex max-w-xs items-center justify-center border-border/80 bg-card p-8 text-card-foreground">
            <DialogTitle className="sr-only">Loading</DialogTitle>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
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
