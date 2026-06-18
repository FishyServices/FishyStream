import { createFileRoute } from "@tanstack/react-router";
import { TVShowsPage } from "@/pages/TVShowsPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

interface TVShowsSearch {
  genre?: string;
  page?: number;
  sort?: string;
}

export const Route = createFileRoute("/tv-shows")({
  validateSearch: (search: Record<string, unknown>): TVShowsSearch => {
    return {
      genre: typeof search.genre === "string" ? search.genre : undefined,
      page: search.page ? Number(search.page) : undefined,
      sort: typeof search.sort === "string" ? search.sort : undefined
    };
  },
  component: () => (
    <AppRouteProviders>
      <TVShowsPage />
    </AppRouteProviders>
  )
});
