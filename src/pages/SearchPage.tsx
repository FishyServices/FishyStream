import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { usePostHog } from "@posthog/react";
import { Filter, Search, X, Tv, Film } from "lucide-react";
import { Header } from "@/components/Header";
import { useSearchAll, type TMDBItem } from "@/hooks/useContent";
import { SearchCard } from "@/components/SearchCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/UXPrimitives";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";
import { isPostHogEnabled } from "@/lib/posthog";

type SearchTypeFilter = "all" | "movie" | "tv";
type SearchSort = "relevance" | "title" | "newest" | "rating";

const TYPE_FILTERS: Array<{ value: SearchTypeFilter; label: string }> = [
  { value: "all", label: "Movies & TV" },
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
  const { results, loading, error } = useSearchAll(query);

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
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-shell-wide page-stack">
        <div className="max-w-2xl mb-10">
          <PageHeader title="Search" />
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search titles"
              value={input}
              autoFocus
              onChange={(e) => handleInput(e.target.value)}
              className="w-full bg-white/8 border border-white/12 focus:border-primary/50 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/12 transition-all text-sm"
            />
            {input && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-white/30 hover:text-white/70 hover:bg-transparent"
                aria-label="Clear search"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {!query && <EmptyState icon={<Search className="h-12 w-12" />} title="Start typing" />}

        {loading && <GridSkeleton />}

        {error && <EmptyState title={error} />}

        {!loading && query && results.length === 0 && !error && (
          <EmptyState title={`No results for "${query}"`} />
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/40 sm:gap-4">
                <span>{filteredResults.length} results</span>
                <span className="flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" /> {movieCount} movies
                </span>
                <span className="flex items-center gap-1">
                  <Tv className="w-3.5 h-3.5" /> {showCount} shows
                </span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    if (VALID_TYPE_FILTERS.has(value as SearchTypeFilter)) {
                      updateSearchParams({ type: value as SearchTypeFilter });
                    }
                  }}
                >
                  <SelectTrigger className="w-full rounded-lg border border-border bg-card/70 text-sm text-foreground/80 sm:w-40">
                    <Film className="w-3.5 h-3.5 shrink-0" />
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
                  <SelectTrigger className="w-full rounded-lg border border-border bg-card/70 text-sm text-foreground/80 sm:w-42">
                    <Filter className="w-3.5 h-3.5 shrink-0" />
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
              <EmptyState title={`No ${typeFilter === "movie" ? "movies" : "shows"}`} />
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 stagger-children">
                {filteredResults.map((item) => (
                  <div key={`${item.type}-${item.tmdbId}`} className="animate-fade-in-up">
                    <SearchCard item={item} layout="grid" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
