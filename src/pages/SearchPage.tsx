import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, Search, X } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useSearchContent } from "@/hooks/useContent";

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(query);

  const results = useSearchContent(query);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  const handleSearch = (value: string) => {
    if (value.trim()) {
      setSearchParams({ q: value.trim() });
    } else {
      setSearchParams({});
    }
  };

  const handlePlay = (tmdbId: string, season?: number, episode?: number) => {
    const params = new URLSearchParams();
    if (season !== undefined) params.set("season", String(season));
    if (episode !== undefined) params.set("episode", String(episode));
    const qs = params.toString();
    navigate(`/watch/${tmdbId}${qs ? `?${qs}` : ""}`);
  };

  const handleClear = () => {
    setInputValue("");
    setSearchParams({});
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 px-4 sm:px-6 lg:px-12 pb-16">
        {/* Search input */}
        <div className="max-w-2xl mb-8">
          <h1 className="text-3xl font-bold text-white mb-4">Search</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="Search titles, genres..."
              value={inputValue}
              autoFocus
              onChange={(e) => {
                setInputValue(e.target.value);
                handleSearch(e.target.value);
              }}
              className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-12 pr-12 text-white placeholder:text-white/40 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all text-base"
            />
            {inputValue && (
              <button
                onClick={handleClear}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        {!query && (
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">Start typing to search movies and TV shows</p>
          </div>
        )}

        {query && results === undefined && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        )}

        {query && results !== undefined && results.length === 0 && (
          <div className="text-center py-20">
            <p className="text-white/60 text-lg mb-2">No results for "{query}"</p>
            <p className="text-white/40 text-sm">Try a different search term</p>
          </div>
        )}

        {query && results && results.length > 0 && (
          <>
            <p className="text-white/50 text-sm mb-6">
              {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.map((item) => (
                <MovieCard key={item._id} content={item} onPlay={handlePlay} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
