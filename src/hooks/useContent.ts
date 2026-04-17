import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useFeaturedContent(): Doc<"content"> | null | undefined {
  return useQuery(api.content.getFeatured);
}

export function useTrendingContent(): Doc<"content">[] | undefined {
  return useQuery(api.content.getTrending);
}

export function usePopularContent(): Doc<"content">[] | undefined {
  return useQuery(api.content.getPopular);
}

export function useNewReleases(): Doc<"content">[] | undefined {
  return useQuery(api.content.getNewReleases);
}

export function useMovies(): Doc<"content">[] | undefined {
  return useQuery(api.content.getMovies);
}

export function useTVShows(): Doc<"content">[] | undefined {
  return useQuery(api.content.getTVShows);
}

export function useContentById(id: string | undefined): Doc<"content"> | null | undefined {
  return useQuery(api.content.getById, id ? { id: id as Doc<"content">["_id"] } : "skip");
}

export function useContentByTmdbId(tmdbId: string | undefined): Doc<"content"> | null | undefined {
  return useQuery(api.content.getByTmdbId, tmdbId ? { tmdbId } : "skip");
}

export function useSearchContent(query: string): Doc<"content">[] | undefined {
  return useQuery(api.content.search, query ? { query } : "skip");
}

export function useContentByGenre(genre: string): Doc<"content">[] | undefined {
  return useQuery(api.content.getByGenre, genre ? { genre } : "skip");
}

export interface ContentCategory {
  id: string;
  title: string;
  content: Doc<"content">[];
}

export function useAllCategories(): ContentCategory[] {
  const trending = useTrendingContent() ?? [];
  const popular = usePopularContent() ?? [];
  const newReleases = useNewReleases() ?? [];
  const movies = useMovies() ?? [];
  const tvShows = useTVShows() ?? [];

  return [
    { id: "trending", title: "Trending Now", content: trending },
    { id: "popular", title: "Popular on FishyStream", content: popular },
    { id: "new", title: "New Releases", content: newReleases },
    { id: "movies", title: "Movies", content: movies },
    { id: "tvshows", title: "TV Shows", content: tvShows }
  ].filter((cat) => cat.content.length > 0);
}
