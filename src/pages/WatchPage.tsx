import { useParams, useSearch } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { useContentPlaybackByTmdbId } from "@/hooks/useContent";

export function WatchPage() {
  const { id } = useParams({ from: "/watch/$id" });
  const search = useSearch({ from: "/watch/$id" });
  const typeHint = search.type;
  const content = useContentPlaybackByTmdbId(id, typeHint);

  const seasonOverride = search.season;
  const episodeOverride = search.episode;
  const initialSource = search.source;

  if (content === undefined) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/80">Loading...</p>
        </div>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Content Not Found</h1>
          <p className="text-white/60">The content you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <VideoPlayer
      content={content}
      initialSeason={seasonOverride}
      initialEpisode={episodeOverride}
      initialSource={initialSource}
    />
  );
}
