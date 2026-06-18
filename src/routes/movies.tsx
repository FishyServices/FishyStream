import { createFileRoute } from "@tanstack/react-router";
import { MoviesPage } from "@/pages/MoviesPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

interface MoviesSearch {
  genre?: string;
  page?: number;
  sort?: string;
}

export const Route = createFileRoute("/movies")({
  validateSearch: (search: Record<string, unknown>): MoviesSearch => {
    return {
      genre: typeof search.genre === "string" ? search.genre : undefined,
      page: search.page ? Number(search.page) : undefined,
      sort: typeof search.sort === "string" ? search.sort : undefined
    };
  },
  component: () => (
    <AppRouteProviders>
      <MoviesPage />
    </AppRouteProviders>
  )
});
