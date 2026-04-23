import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Search, X, Tv, Film } from "lucide-react";
import { Header } from "@/components/Header";
import { useSearchAll } from "@/hooks/useContent";
import { SearchCard } from "@/components/SearchCard";

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [input, setInput] = useState(query);
  const { results, loading, error } = useSearchAll(query);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const handleInput = (val: string) => {
    setInput(val);
    if (val.trim()) setSearchParams({ q: val.trim() });
    else setSearchParams({});
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-stack px-4 sm:px-6 lg:px-10">
        {/* Search box */}
        <div className="max-w-2xl mb-10">
          <h1 className="font-display text-3xl font-black text-white mb-5">Search</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              type="text"
              placeholder="Search movies, TV shows, genres..."
              value={input}
              autoFocus
              onChange={(e) => handleInput(e.target.value)}
              className="w-full bg-white/8 border border-white/12 focus:border-primary/50 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/12 transition-all text-sm"
            />
            {input && (
              <button
                onClick={() => handleInput("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
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
            <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/40 sm:gap-4">
              <span>{results.length} results</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Film className="w-3.5 h-3.5" /> {results.filter((r) => r.type === "movie").length}{" "}
                movies
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Tv className="w-3.5 h-3.5" /> {results.filter((r) => r.type === "tv").length} shows
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 stagger-children">
              {results.map((item) => (
                <div key={`${item.type}-${item.tmdbId}`} className="animate-fade-in-up">
                  <SearchCard item={item} layout="grid" />
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
