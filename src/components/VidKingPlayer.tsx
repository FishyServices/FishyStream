import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface VidKingPlayerProps {
  vidkingUrl?: string;
  imdbId?: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

export function VidKingPlayer({
  vidkingUrl,
  imdbId,
  type,
  season = 1,
  episode = 1,
}: VidKingPlayerProps) {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Construct VidKing embed URL
  const getEmbedUrl = (): string => {
    if (vidkingUrl) {
      return vidkingUrl;
    }
    if (imdbId) {
      const baseUrl = "https://www.vidking.net/embed";
      if (type === "movie") {
        return `${baseUrl}/movie/${imdbId}`;
      }
      return `${baseUrl}/tv/${imdbId}/${season}/${episode}`;
    }
    return "";
  };

  const embedUrl = getEmbedUrl();

  useEffect(() => {
    if (!embedUrl) {
      setError("No video source available");
      setIsLoading(false);
    }
  }, [embedUrl]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setError("Failed to load video player");
    setIsLoading(false);
  };

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-white/80">Loading player...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center max-w-md px-4">
            <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
            <p className="text-white/60 mb-6">{error}</p>
            <Button onClick={() => navigate(-1)}>Go Back</Button>
          </div>
        </div>
      )}

      {/* Video iframe */}
      {embedUrl && !error && (
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          title="Video Player"
        />
      )}

      {!embedUrl && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/60">No video URL configured</p>
          </div>
        </div>
      )}
    </div>
  );
}
