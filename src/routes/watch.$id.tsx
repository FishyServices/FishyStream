import { createFileRoute } from "@tanstack/react-router";
import { WatchPage } from "@/pages/WatchPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

interface WatchSearch {
  type?: "movie" | "tv";
  season?: number;
  episode?: number;
  source?: string;
  dub?: boolean;
}

export const Route = createFileRoute("/watch/$id")({
  validateSearch: (search: Record<string, unknown>): WatchSearch => {
    return {
      type: search.type === "movie" || search.type === "tv" ? search.type : undefined,
      season: search.season ? Number(search.season) : undefined,
      episode: search.episode ? Number(search.episode) : undefined,
      source: typeof search.source === "string" ? search.source : undefined,
      dub: search.dub === "true" || search.dub === true
    };
  },
  component: () => (
    <AppRouteProviders>
      <WatchPage />
    </AppRouteProviders>
  )
});
