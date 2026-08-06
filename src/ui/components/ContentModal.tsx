import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Plus,
  Check,
  Star,
  Clock,
  Tv,
  Film,
  User,
  Loader2,
  Download,
  Globe,
  FileVideo,
  ExternalLink,
  AlertTriangle
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
import { useUser } from "@clerk/react";
import {
  useIsInWatchlist,
  useToggleWatchlist,
  type WatchlistSnapshot
} from "@/features/library/useWatchlist";
import { toast } from "@fishy/ui";
import {
  useContentCredits,
  useContentVideos,
  useRelatedContent,
  useContentDetail,
  useSeasonEpisodes,
  useSeriesEpisodeRatings
} from "@/features/catalog/queries/useContent";
import type { TMDBItem } from "@/features/catalog/queries/useContent";
import { getCanonicalSeasonCount } from "@fishy/providers/anime";
import type { PlayHandler } from "@/shared/navigation/watchNavigation";
import type { ContentDetail, ContentId, ContentType } from "@content/contentMetadata";
import { fetchDownloads } from "@/shared/downloads";
import { useAppSettings } from "@/features/settings/useAppSettings";

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

function getImdbId(content: ModalContent | null): string | undefined {
  if (!content || !("imdbId" in content)) return undefined;
  return typeof content.imdbId === "string" ? content.imdbId : undefined;
}

function EpisodePill({
  ep,
  selected,
  onClick,
  showRating
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
  showRating: boolean;
}) {
  return (
    <Button
      variant="ghost"
      className={`group flex h-auto w-full items-start justify-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        selected
          ? "border-primary/50 bg-primary/10 shadow-sm"
          : "border-transparent bg-card/40 hover:border-border hover:bg-accent/65"
      }`}
      onClick={onClick}
    >
      {ep.stillUrl ? (
        <img
          src={ep.stillUrl}
          alt={ep.name}
          className="h-14 w-24 shrink-0 rounded-lg bg-muted object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Tv className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">E{ep.episodeNumber}</span>
          {selected && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary">
              Now selected
            </span>
          )}
        </div>
        <p className="line-clamp-1 text-sm font-medium text-foreground">{ep.name}</p>
        {ep.overview && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ep.overview}</p>
        )}
        {ep.runtime && <p className="mt-1 text-[11px] text-muted-foreground/80">{ep.runtime}m</p>}
      </div>
      {showRating && ep.voteAverage !== undefined && ep.voteAverage > 0 && (
        <span className="mt-1 flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-300">
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          {ep.voteAverage.toFixed(1)}
        </span>
      )}
      <Play className="mt-4 h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-primary" />
    </Button>
  );
}

function getRatingColor(rating: number) {
  if (rating >= 9) return "bg-emerald-500 text-emerald-950";
  if (rating >= 8) return "bg-green-500 text-green-950";
  if (rating >= 7) return "bg-yellow-300 text-yellow-950";
  if (rating >= 6) return "bg-amber-400 text-amber-950";
  if (rating >= 5) return "bg-red-400 text-red-950";
  return "bg-purple-400 text-purple-950";
}

function EpisodeRatingsGrid({
  seasons
}: {
  seasons: Array<{
    seasonNumber: number;
    episodes: Array<{ episodeNumber: number; name: string; voteAverage: number }>;
  }>;
}) {
  const ratedEpisodes = seasons.flatMap((season) =>
    season.episodes.filter((episode) => episode.voteAverage > 0)
  );
  if (ratedEpisodes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        IMDb episode ratings are not available for this series.
      </p>
    );
  }

  const average =
    ratedEpisodes.reduce((total, episode) => total + episode.voteAverage, 0) / ratedEpisodes.length;
  const episodeCount = Math.max(...seasons.map((season) => season.episodes.length));

  return (
    <section aria-labelledby="episode-ratings-heading">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 id="episode-ratings-heading" className="text-sm font-semibold text-foreground">
          Episode ratings
        </h3>
      </div>
      <div className="mb-5 flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
        {[
          ["Awesome", "bg-emerald-500"],
          ["Great", "bg-green-500"],
          ["Good", "bg-yellow-300"],
          ["Regular", "bg-amber-400"],
          ["Bad", "bg-red-400"],
          ["Garbage", "bg-purple-400"]
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid w-fit min-w-44 gap-x-1.5 gap-y-1.5"
          style={{ gridTemplateColumns: `2.5rem repeat(${seasons.length}, 3.5rem)` }}
        >
          <span />
          {seasons.map((season) => (
            <span
              key={season.seasonNumber}
              className="pb-1 text-center text-xs font-semibold text-muted-foreground"
            >
              S{season.seasonNumber}
            </span>
          ))}
          {Array.from({ length: episodeCount }, (_, index) => index + 1).map((episodeNumber) => (
            <div className="contents" key={episodeNumber}>
              <span className="self-center text-xs font-medium text-muted-foreground">
                E{episodeNumber}
              </span>
              {seasons.map((season) => {
                const episode = season.episodes.find(
                  (item) => item.episodeNumber === episodeNumber
                );
                if (!episode) return <span key={season.seasonNumber} />;
                return episode.voteAverage > 0 ? (
                  <div
                    key={season.seasonNumber}
                    className={`flex h-9 w-12 items-center justify-center rounded-md text-base font-bold tabular-nums ${getRatingColor(
                      episode.voteAverage
                    )}`}
                    title={`${episode.name}: ${episode.voteAverage.toFixed(1)} / 10`}
                    aria-label={`${episode.name}: ${episode.voteAverage.toFixed(1)} out of 10`}
                  >
                    {episode.voteAverage.toFixed(1)}
                  </div>
                ) : (
                  <div
                    key={season.seasonNumber}
                    className="flex h-9 w-12 items-center justify-center rounded-md bg-muted text-base font-bold text-muted-foreground"
                    title={`${episode.name}: rating unavailable`}
                    aria-label={`${episode.name}: rating unavailable`}
                  >
                    ?
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-end gap-4">
        <span className="pb-1 text-xs font-semibold text-muted-foreground">AVG.</span>
        {seasons.map((season) => {
          const ratings = season.episodes.filter((episode) => episode.voteAverage > 0);
          const seasonAverage =
            ratings.reduce((total, episode) => total + episode.voteAverage, 0) / ratings.length;
          return (
            <span
              key={season.seasonNumber}
              className="border-b-2 border-yellow-300 pb-1 text-xl font-bold tabular-nums text-foreground"
            >
              {Number.isFinite(seasonAverage) ? seasonAverage.toFixed(1) : "—"}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Ratings sourced from IMDb.</p>
    </section>
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
  const [activeTab, setActiveTab] = useState<
    "episodes" | "ratings" | "cast" | "videos" | "related" | "downloads"
  >(initialTab ?? "episodes");
  const { settings } = useAppSettings();

  const tmdbDetailEnabled = isOpen && !!content && !!content.tmdbId;
  const { detail: tmdbDetail } = useContentDetail(
    tmdbDetailEnabled ? content?.tmdbId : undefined,
    tmdbDetailEnabled ? content?.type : undefined,
    tmdbDetailEnabled,
    false
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
        hasSpecials: tmdbDetail.hasSpecials,
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
    ? {
        ...fullContent,
        ...content,
        _id: fullContent._id,
        rating: fullContent.rating,
        voteAverage: fullContent.voteAverage,
        imdbId: fullContent.imdbId
      }
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
  const { seasons: ratingSeasons, isLoading: ratingsLoading } = useSeriesEpisodeRatings(
    resolvedContent?.type === "tv" ? resolvedContent.tmdbId : undefined,
    getSeasonCount(resolvedContent) ?? 1,
    isOpen && activeTab === "ratings" && settings.showEpisodeRatings,
    getImdbId(resolvedContent)
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
  const hasSpecials =
    resolvedContent?.type === "tv" &&
    ("hasSpecials" in resolvedContent ? resolvedContent.hasSpecials === true : false);

  const { detail: relatedTmdbDetail } = useContentDetail(
    relatedModalItem ? String(relatedModalItem.tmdbId) : undefined,
    relatedModalItem?.type,
    !!relatedModalItem,
    false
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
      hasSpecials: relatedTmdbDetail.hasSpecials,
      tagline: relatedTmdbDetail.tagline,
      originalLanguage: relatedTmdbDetail.originalLanguage,
      imdbId: relatedTmdbDetail.imdbId,
      totalEpisodes: relatedTmdbDetail.totalEpisodes,
      status: relatedTmdbDetail.status,
      trending: relatedTmdbDetail.trending,
      new: relatedTmdbDetail.isNew
    } as ContentDetail);
  }, [relatedTmdbDetail, relatedModalItem]);

  const [downloads, setDownloads] = useState<any[]>([]);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === "downloads" && resolvedContent) {
      const loadDownloads = async () => {
        try {
          setDownloadsLoading(true);
          setDownloadsError(null);
          setDownloads([]);

          const currentEpisodeObj = dbSeason?.episodes?.find(
            (ep) => ep.episodeNumber === selectedEpisode
          );
          const episodeTitle = currentEpisodeObj?.name;

          const results = await fetchDownloads(
            resolvedContent,
            selectedSeason,
            selectedEpisode,
            episodeTitle
          );

          setDownloads(results);
        } catch (error) {
          console.error("Download loading failed:", error);
          setDownloadsError("Failed to load download options. Please try again later.");
          setDownloads([]);
        } finally {
          setDownloadsLoading(false);
        }
      };

      loadDownloads();
    }
  }, [
    isOpen,
    activeTab,
    resolvedContent?._id,
    resolvedContent?.title,
    resolvedContent?.type,
    resolvedContent?.tmdbId,
    selectedSeason,
    selectedEpisode,
    dbSeason?.episodes
  ]);

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

  useEffect(() => {
    if (!settings.showEpisodeRatings && activeTab === "ratings") {
      setActiveTab("episodes");
    }
  }, [activeTab, settings.showEpisodeRatings]);

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
  const heroImageUrl = detailContent?.backdropUrl;

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
      <DialogContent className="z-modal flex max-h-[min(96dvh,70rem)] w-[calc(100%-1rem)] max-w-4xl flex-col overflow-hidden rounded-xl border border-border/70 bg-card/95 p-0 text-card-foreground shadow-md [&>button]:right-4 [&>button]:top-4 [&>button]:z-20 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-xl [&>button]:border [&>button]:border-border/80 [&>button]:bg-background/80 [&>button:hover]:bg-accent">
        {" "}
        <DialogTitle className="sr-only">{contentData.title}</DialogTitle>
        <div className="relative h-72 shrink-0 overflow-hidden sm:h-96">
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
            <div className="relative flex h-full w-full items-center overflow-hidden bg-muted/55">
              <div className="absolute inset-0 bg-muted/60" />
              <Film className="relative ml-7 h-10 w-10 text-primary/55" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-card via-background/45 to-transparent" />
          <div className="absolute inset-0 bg-linear-to-r from-background/35 via-transparent to-transparent" />
          {contentData.posterUrl && (
            <img
              src={contentData.posterUrl}
              alt=""
              aria-hidden="true"
              className="absolute bottom-0 right-8 hidden h-52 w-35 rounded-t-xl border border-b-0 border-border/70 bg-muted object-cover shadow-md lg:block"
            />
          )}
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <h2 className="mb-4 max-w-2xl font-display text-3xl font-black leading-[0.95] tracking-tight text-foreground sm:text-4xl lg:pr-44">
              {contentData.title}
            </h2>
            <div className="flex items-center gap-3">
              <Button
                className="rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => handlePlay()}
              >
                <Play className="mr-2 h-4 w-4 fill-current" />
                {contentData.progress && contentData.progress > 0 ? "Resume" : "Play"}
                {isTV ? ` S${selectedSeason} E${selectedEpisode}` : ""}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="flex h-10 w-10 rounded-xl border-border/80 bg-background/70 text-foreground hover:bg-accent"
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
          <div className="space-y-6 p-5 sm:p-7">
            {isHydratingContent && (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading title details
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {contentData.voteAverage && contentData.voteAverage > 0 && (
                <span className="flex items-center gap-1 font-semibold text-amber-300">
                  <Star className="h-4 w-4 fill-yellow-400" />
                  {contentData.voteAverage.toFixed(1)}
                </span>
              )}

              {detailContent?.duration && (
                <span className="flex items-center gap-3 text-muted-foreground">
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
              <span className="flex items-center gap-1 text-muted-foreground">
                {isTV ? <Tv className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                {isTV ? `${totalSeasons} Season${totalSeasons > 1 ? "s" : ""}` : "Movie"}
              </span>
            </div>

            {detailContent?.description && (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
                {compactCopy ? detailContent.description.slice(0, 360) : detailContent.description}
              </p>
            )}

            {(contentData.genre?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {(contentData.genre ?? []).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-border/70 bg-muted/45 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {contentData.progress !== undefined && contentData.progress > 0 && (
              <div className="rounded-xl border border-border/70 bg-muted/45 p-4">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {isTV && contentData.seasonNumber
                      ? `Season ${contentData.seasonNumber}, Ep ${contentData.episodeNumber}`
                      : "Progress"}
                  </span>
                  <span>{Math.round(contentData.progress)}%</span>
                </div>
                <div className="media-progress">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${contentData.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-1 overflow-x-auto rounded-xl border border-border/65 bg-muted/35 p-1">
              {isTV && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveTab("episodes")}
                  className={`h-auto shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === "episodes"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  Episodes
                </Button>
              )}
              {isTV && settings.showEpisodeRatings && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveTab("ratings")}
                  className={`h-auto shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === "ratings"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  Ratings
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("cast")}
                className={`h-auto shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "cast"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Cast
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("videos")}
                className={`h-auto shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "videos"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Trailers
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("related")}
                className={`h-auto shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "related"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Related
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("downloads")}
                className={`h-auto shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "downloads"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Downloads
              </Button>
            </div>

            {isTV && activeTab === "episodes" && (totalSeasons > 1 || hasSpecials) && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <Select
                  value={String(selectedSeason)}
                  onValueChange={(value) => {
                    const season = Number(value);
                    handleSeasonChange(season);
                    setEpisodeLoadError(null);
                  }}
                >
                  <SelectTrigger className="w-40 rounded-xl border-border/80 bg-background text-foreground">
                    <SelectValue placeholder="Season">
                      {selectedSeason === 0 ? "Specials" : `Season ${selectedSeason}`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="border-border/80 bg-popover text-popover-foreground">
                    {[
                      ...(hasSpecials ? [0] : []),
                      ...Array.from({ length: totalSeasons }, (_, i) => i + 1)
                    ].map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s === 0 ? "Specials" : `Season ${s}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === "episodes" && isTV && (
              <div>
                {dbSeason?.overview && (
                  <p className="mb-3 text-sm text-muted-foreground">{dbSeason.overview}</p>
                )}

                {tmdbSeasonLoading && episodes.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Loading episodes</p>
                ) : episodeLoadError ? (
                  <p className="py-8 text-center text-xs text-red-300/80">{episodeLoadError}</p>
                ) : episodes.length > 0 ? (
                  <div className="space-y-2">
                    {episodes.map((ep) => (
                      <EpisodePill
                        key={ep.episodeNumber}
                        ep={ep}
                        selected={ep.episodeNumber === selectedEpisode}
                        showRating={settings.showEpisodeRatings}
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

            {activeTab === "ratings" &&
              isTV &&
              settings.showEpisodeRatings &&
              (ratingsLoading ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Loading ratings</p>
              ) : (
                <EpisodeRatingsGrid seasons={ratingSeasons} />
              ))}

            {activeTab === "cast" && (
              <div>
                {!credits ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : credits.cast.length > 0 ? (
                  <>
                    <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-2">
                      {credits.cast.slice(0, 10).map((actor) => (
                        <div key={actor.id} className="w-17 shrink-0 text-center">
                          {actor.profileUrl ? (
                            <img
                              src={actor.profileUrl}
                              alt={actor.name}
                              className="mb-2 h-16 w-16 rounded-full border-2 border-border/70 bg-muted object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2 border-border/70 bg-muted">
                              <User className="h-6 w-6 text-muted-foreground/60" />
                            </div>
                          )}
                          <p className="line-clamp-2 text-[11px] font-medium text-foreground">
                            {actor.name}
                          </p>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground">
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
                        <div className="relative mb-1.5 aspect-video overflow-hidden rounded-xl border border-border/60 bg-muted shadow-sm">
                          <img
                            src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                            alt={video.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10">
                            <Play className="h-8 w-8 fill-white text-white " />
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
                        className="group cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => handleRelatedClick(item)}
                      >
                        <div className="mb-2 aspect-2/3 overflow-hidden rounded-xl border border-border/60 bg-muted shadow-sm">
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <p className="line-clamp-1 text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.year} · {item.voteAverage?.toFixed(1)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "downloads" && (
              <div>
                {downloadsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : downloadsError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-red-300/90">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {downloadsError}
                    </div>
                  </div>
                ) : downloads.length > 0 ? (
                  <div className="space-y-2">
                    {downloads
                      .filter((d) => d.source !== "AnimeShrine")
                      .map((download, idx) => (
                        <a
                          key={idx}
                          href={download.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center justify-between rounded-xl border border-border/60 bg-muted/35 p-4 transition-colors hover:bg-muted/55 hover:border-border/80"
                        >
                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              {download.direct ? (
                                <Download className="h-5 w-5 text-primary" />
                              ) : (
                                <ExternalLink className="h-5 w-5 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                {download.name}
                              </p>
                              <p className="text-xs text-muted-foreground/70">{download.source}</p>
                            </div>
                          </div>
                          <div className="ml-2 shrink-0">
                            <Globe className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-primary" />
                          </div>
                        </a>
                      ))}

                    {downloads.filter((d) => d.source === "AnimeShrine").length > 0 && (
                      <div className="group flex items-center justify-between rounded-xl border border-border/60 bg-muted/35 p-4 transition-colors hover:bg-muted/55">
                        <div className="flex flex-1 items-center gap-3 min-w-0 mr-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <ExternalLink className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">
                              AnimeShrine Options
                            </p>
                            <p className="text-xs text-muted-foreground/70">AnimeShrine</p>
                          </div>
                        </div>
                        <div className="w-45 shrink-0">
                          <Select
                            onValueChange={(val) => {
                              if (val) window.open(val as string, "_blank", "noopener,noreferrer");
                            }}
                          >
                            <SelectTrigger className="w-full text-xs">
                              <SelectValue placeholder="Select Option..." />
                            </SelectTrigger>
                            <SelectContent>
                              {downloads
                                .filter((d) => d.source === "AnimeShrine")
                                .map((dl, idx) => (
                                  <SelectItem key={idx} value={dl.url}>
                                    {dl.name
                                      .replace("Open Download Page (AnimeShrine - ", "")
                                      .replace(")", "")}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No downloads available
                  </p>
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
          <DialogContent className="z-modal flex max-w-xs items-center justify-center border-border/80 bg-card p-8 text-card-foreground">
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
