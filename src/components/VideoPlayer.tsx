import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { ArrowLeft, Loader2, AlertCircle, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VideoPlayerProps {
  content: Doc<"content">;
}

interface StreamSource {
  name: string;
  url: string;
  quality: string;
}

export function VideoPlayer({ content }: VideoPlayerProps) {
  const navigate = useNavigate();
  const getMovieSources = useAction(api.providers.getMovieSources);
  const getTVSources = useAction(api.providers.getTVSources);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSources = async () => {
      if (!content.imdbId && !content.tmdbId) {
        setError("No video ID available for this content");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        let fetchedSources;
        
        if (content.type === "tv") {
          fetchedSources = await getTVSources({ 
            imdbId: content.imdbId || undefined,
            tmdbId: content.tmdbId || undefined,
            season: 1,
            episode: 1
          });
        } else {
          fetchedSources = await getMovieSources({ 
            imdbId: content.imdbId || undefined,
            tmdbId: content.tmdbId || undefined 
          });
        }
        
        const safeSources = fetchedSources ?? [];
        setSources(safeSources);
        const firstSource = safeSources[0];
        if (firstSource) {
          setSelectedSource(firstSource.url);
        }
      } catch (e) {
        setError("Failed to load streaming sources");
      } finally {
        setLoading(false);
      }
    };

    loadSources();
  }, [content.imdbId, content.tmdbId, content.type, getMovieSources, getTVSources]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/80">Finding best streaming source...</p>
        </div>
      </div>
    );
  }

  if (error || sources.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Sources Available</h2>
          <p className="text-white/60 mb-6">{error || "Could not find any streaming sources for this content."}</p>
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none flex items-center justify-between p-4 bg-black/90 backdrop-blur-sm border-b border-white/10 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-white">{content.title}</h1>
            <p className="text-sm text-white/60">
              {content.type === "movie" ? "Movie" : "TV Series"} • {content.year}
            </p>
          </div>
        </div>
        
        <Select value={selectedSource} onValueChange={setSelectedSource}>
          <SelectTrigger className="w-[200px] bg-white/10 border-white/20 text-white">
            <MonitorPlay className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-black border-white/20">
            {sources.map((source) => (
              <SelectItem 
                key={source.url} 
                value={source.url}
                className="text-white focus:bg-white/10 focus:text-white"
              >
                {source.name} ({source.quality})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Video Player */}
      <div className="flex-1 relative bg-black">
        <iframe
          src={selectedSource}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video Player"
        />
      </div>
    </div>
  );
}
