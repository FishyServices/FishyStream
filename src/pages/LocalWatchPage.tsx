import { Navigate, useLocation } from "react-router-dom";
import { CustomVideoPlayer } from "@/ui/components/CustomVideoPlayer";
import type { ContentPlayback } from "@content/contentMetadata";

const LOCAL_CONTENT: ContentPlayback = {
  _id: "tmdb:movie:local-file" as ContentPlayback["_id"],
  title: "Local video",
  type: "movie",
  genre: [],
  year: new Date().getFullYear()
};

export function LocalWatchPage() {
  const location = useLocation();
  const state = location.state as { file?: unknown } | null;
  const file = typeof File !== "undefined" && state?.file instanceof File ? state.file : null;

  if (!file) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-black">
      <CustomVideoPlayer
        embedUrl=""
        localFile={file}
        content={LOCAL_CONTENT}
        tvTarget={{ season: 1, episode: 1 }}
        animeContent={false}
        isDub={false}
        onPlaybackEvent={() => {}}
        showDubToggle={false}
        handleDubToggle={() => {}}
        selectedSource="local-file"
        onSelectProvider={() => {}}
        groupedSources={[]}
        onInfoClick={() => {}}
      />
    </main>
  );
}
