import { useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { VideoPlayer } from "@/ui/components/VideoPlayer";
import { useContentPlaybackByTmdbId } from "@/features/catalog/queries/useContent";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";

export function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  const typeHint = typeParam === "movie" || typeParam === "tv" ? typeParam : undefined;
  const content = useContentPlaybackByTmdbId(id, typeHint);

  const initialSeason = searchParams.get("season");
  const initialEpisode = searchParams.get("episode");
  const initialSource = searchParams.get("source");
  const seasonOverride = initialSeason ? Number(initialSeason) : undefined;
  const episodeOverride = initialEpisode ? Number(initialEpisode) : undefined;

  const contentTitle = content && content !== null ? (content.title ?? "Watch") : "Watch";
  const contentOverview =
    content && content !== null
      ? ((content as { overview?: string }).overview ?? "Stream this title on FishyStream.")
      : "Stream this title on FishyStream.";

  useSeoMeta({
    title: contentTitle,
    description: contentOverview,
    path: id ? `/watch/${id}` : "/watch",
    noIndex: false
  });

  if (content === undefined) {
    return (
      <div className="app-canvas flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="app-canvas flex min-h-screen items-center justify-center px-6">
        <div className="media-surface max-w-md rounded-2xl p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-foreground">Title not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This title is no longer available.</p>
        </div>
      </div>
    );
  }

  return (
    <VideoPlayer
      content={content}
      initialSeason={seasonOverride}
      initialEpisode={episodeOverride}
      initialSource={initialSource || undefined}
    />
  );
}
