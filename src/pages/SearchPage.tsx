import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Filter, Loader2, Search, X, Tv, Film } from "lucide-react";
import { Header } from "@/components/Header";
import { useSearchAll, type TMDBItem } from "@/hooks/useContent";
import { SearchCard } from "@/components/SearchCard";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@fishy/ui";

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
  const navigate = useNavigate({ from: "/search" });
  const searchParams = useSearch({ from: "/search" });

  const query = searchParams.q ?? "";
  const typeParam = searchParams.type;
  const sortParam = searchParams.sort;

  const typeFilter: SearchTypeFilter =
    typeParam && VALID_TYPE_FILTERS.has(typeParam as SearchTypeFilter)
      ? (typeParam as SearchTypeFilter)
      : "all";
  const sort: SearchSort =
    sortParam && VALID_SORTS.has(sortParam as SearchSort) ? (sortParam as SearchSort) : "relevance";

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

  const handleInput = (val: string) => {
    setInput(val);
    void navigate({
      search: (prev) => {
        if (val.trim()) {
          return { ...prev, q: val.trim() };
        }
        const next = { ...prev };
        delete next.q;
        delete next.type;
        delete next.sort;
        return next;
      }
    });
  };

  const updateSearchParams = (updates: { type?: SearchTypeFilter; sort?: SearchSort }) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev };
        if (updates.type !== undefined) {
          if (updates.type === "all") {
            delete next.type;
          } else {
            next.type = updates.type;
          }
        }
        if (updates.sort !== undefined) {
          if (updates.sort === "relevance") {
            delete next.sort;
          } else {
            next.sort = updates.sort;
          }
        }
        return next;
      }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-stack px-4 sm:px-6 lg:px-10">
        {/* Search box */}
        <div className="max-w-2xl mb-10">
          <h1 className="font-display text-3xl font-black text-white mb-5">Search</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search movies, TV shows, genres..."
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
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Results */}
        {!query && (
          <div className="text-center py-24">
            <Search className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40">Search across thousands of movies and TV shows</p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!loading && query && results.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-white/50 mb-2">No results for "{query}"</p>
            <p className="text-white/30 text-sm">Try a different search term</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/40 sm:gap-4">
                <span>{filteredResults.length} results</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" /> {movieCount} movies
                </span>
                <span>·</span>
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
                    <SelectValue placeholder="Type" />
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
                    <SelectValue placeholder="Sort" />
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
              <div className="text-center py-16">
                <p className="text-white/50 mb-2">
                  No {typeFilter === "movie" ? "movies" : "TV shows"} for "{query}"
                </p>
                <p className="text-white/30 text-sm">Try another type filter</p>
              </div>
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
