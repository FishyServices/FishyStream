import { useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { useContentPlaybackByTmdbId } from "@/hooks/useContent";
import { useSeoMeta } from "@/hooks/useSeoMeta";

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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-white/70">Finding sources</p>
        </div>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Not found</h1>
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
