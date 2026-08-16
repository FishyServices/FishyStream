import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { usePostHog } from "@posthog/react";
import { Filter, Search, X, Tv, Film } from "lucide-react";
import { Header } from "@/ui/components/Header";
import { useSearchAll, type TMDBItem } from "@/features/catalog/queries/useContent";
import { SearchCard } from "@/ui/components/SearchCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";
import { isPostHogEnabled } from "@/shared/config/posthog";

type SearchTypeFilter = "all" | "movie" | "tv";
type SearchSort = "relevance" | "title" | "newest" | "rating";

const TYPE_FILTERS: Array<{ value: SearchTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" }
];

const SORT_OPTIONS: Array<{ value: SearchSort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Highest rated" },
  { value: "title", label: "Title A-Z" }
];

const VALID_TYPE_FILTERS = new Set<SearchTypeFilter>(TYPE_FILTERS.map((filter) => filter.value));
const VALID_SORTS = new Set<SearchSort>(SORT_OPTIONS.map((sort) => sort.value));

function sortSearchResults(items: TMDBItem[], sort: SearchSort) {
  const sorted = [...items];

  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "newest") {
    sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else if (sort === "rating") {
    sorted.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0));
  }

  return sorted;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const posthog = usePostHog();

  useSeoMeta({
    title: "Search",
    description:
      "Search for movies and TV shows on FishyStream. Find your next favourite thing to watch.",
    path: "/search"
  });
  const lastTrackedSearchRef = useRef<string | null>(null);
  const query = searchParams.get("q") ?? "";
  const typeParam = searchParams.get("type");
  const sortParam = searchParams.get("sort");
  const typeFilter: SearchTypeFilter =
    typeParam && VALID_TYPE_FILTERS.has(typeParam as SearchTypeFilter)
      ? (typeParam as SearchTypeFilter)
      : "all";
  const sort: SearchSort =
    sortParam && VALID_SORTS.has(sortParam as SearchSort) ? (sortParam as SearchSort) : "relevance";
  const typeLabel = TYPE_FILTERS.find((filter) => filter.value === typeFilter)?.label ?? "Type";
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Sort";
  const [input, setInput] = useState(query);
  const { results, loading, loadingMore, canLoadMore, loadMore, error } = useSearchAll(query);

  const movieCount = results.filter((r) => r.type === "movie").length;
  const showCount = results.filter((r) => r.type === "tv").length;
  const filteredResults = useMemo(() => {
    const byType =
      typeFilter === "all" ? results : results.filter((item) => item.type === typeFilter);
    return sortSearchResults(byType, sort);
  }, [results, sort, typeFilter]);

  useEffect(() => {
    setInput(query);
  }, [query]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!isPostHogEnabled || !normalizedQuery || loading) return;

    const trackingKey = JSON.stringify({
      query: normalizedQuery,
      typeFilter,
      sort,
      resultCount: results.length,
      error
    });
    if (lastTrackedSearchRef.current === trackingKey) return;
    lastTrackedSearchRef.current = trackingKey;

    posthog.capture("search_performed", {
      query: normalizedQuery,
      type_filter: typeFilter,
      sort,
      result_count: results.length,
      filtered_result_count: filteredResults.length,
      movie_count: movieCount,
      show_count: showCount,
      has_error: Boolean(error),
      error_message: error ?? undefined
    });
  }, [
    error,
    filteredResults.length,
    loading,
    movieCount,
    posthog,
    query,
    results.length,
    showCount,
    sort,
    typeFilter
  ]);

  const handleInput = (val: string) => {
    setInput(val);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (val.trim()) {
        next.set("q", val.trim());
      } else {
        next.delete("q");
        next.delete("type");
        next.delete("sort");
      }
      return next;
    });
  };

  const updateSearchParams = (updates: { type?: SearchTypeFilter; sort?: SearchSort }) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (updates.type !== undefined) {
        if (updates.type === "all") {
          next.delete("type");
        } else {
          next.set("type", updates.type);
        }
      }
      if (updates.sort !== undefined) {
        if (updates.sort === "relevance") {
          next.delete("sort");
        } else {
          next.set("sort", updates.sort);
        }
      }
      return next;
    });
  };

  return (
    <div className="app-canvas min-h-screen">
      <Header />

      <main className="page-shell-wide page-stack">
        <div className="mb-8 max-w-3xl">
          <PageHeader title="Search" />
          <div className="media-surface relative rounded-xl border-border/65 bg-card/72 p-1.5 shadow-sm">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
            <Input
              type="text"
              placeholder="Search titles"
              value={input}
              autoFocus
              onChange={(e) => handleInput(e.target.value)}
              className="h-12 w-full rounded-xl border-0 bg-transparent py-3.5 pl-11 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
            />
            {input && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleInput("")}
                className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {!query && (
          <EmptyState icon={<Search className="h-12 w-12" />} title="Search movies and TV shows" />
        )}

        {loading && <GridSkeleton />}

        {error && <EmptyState title={error} />}

        {!loading && query && results.length === 0 && !error && (
          <EmptyState title={`No matches for "${query}"`} />
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border/60 bg-card/42 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded-full bg-primary/12 px-2.5 py-1 font-semibold text-primary">
                  {filteredResults.length} results
                </span>
                <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Film className="h-3.5 w-3.5" /> {movieCount}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Tv className="h-3.5 w-3.5" /> {showCount}
                </span>
              </div>

              <div className="flex gap-3">
                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    if (VALID_TYPE_FILTERS.has(value as SearchTypeFilter)) {
                      updateSearchParams({ type: value as SearchTypeFilter });
                    }
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/65 text-sm text-foreground sm:w-36">
                    <Film className="h-3.5 w-3.5 shrink-0" />
                    <span>{typeLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_FILTERS.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={sort}
                  onValueChange={(value) => {
                    if (VALID_SORTS.has(value as SearchSort)) {
                      updateSearchParams({ sort: value as SearchSort });
                    }
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/65 text-sm text-foreground sm:w-40">
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span>{sortLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredResults.length === 0 ? (
              <EmptyState
                title={`No ${typeFilter === "movie" ? "movies" : "shows"} match this filter`}
              />
            ) : (
              <>
                <div className="rounded-xl border border-border/55 bg-card/25 p-3 sm:p-5">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 stagger-children">
                    {filteredResults.map((item) => (
                      <div key={`${item.type}-${item.tmdbId}`} className="animate-fade-in-up">
                        <SearchCard item={item} layout="grid" />
                      </div>
                    ))}
                  </div>
                </div>

                {canLoadMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-xl"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading…" : "Load more items"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
