import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, Search, X, Tv, Film } from "lucide-react";
import { Header } from "@/components/Header";
import { useSearchAll, type SearchResult } from "@/hooks/useContent";
import { Badge } from "@/components/ui/badge";

function SearchResultCard({
  result,
  onClick
}: {
  result: SearchResult;
  onClick: (id: number) => void;
}) {
  return (
    <div
      className="relative flex-shrink-0 cursor-pointer group/card"
      onClick={() => onClick(result.tmdbId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(result.tmdbId);
        }
      }}
      aria-label={`${result.title} - ${result.year}`}
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden transition-all duration-300 group-hover/card:scale-105 group-hover/card:z-20 group-hover/card:shadow-2xl group-hover/card:shadow-black/60">
        <img
          src={result.posterUrl}
          alt={`${result.title} poster`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.title.slice(0, 2))}&size=500&background=1a1a2e&color=666`;
          }}
        />
        <div className="absolute top-2 right-2">
          <Badge
            className={result.type === "movie" ? "bg-primary" : "bg-accent text-accent-foreground"}
          >
            {result.type === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
          </Badge>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity">
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h3 className="text-sm font-semibold text-white truncate">{result.title}</h3>
            <div className="flex items-center gap-2 text-xs text-white/60 mt-1">
              <span className="text-success font-medium">{result.rating}</span>
              <span>{result.year}</span>
              {result.seasons && <span>{result.seasons} Seasons</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(query);
  const { results, loading, error } = useSearchAll(query);

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

  const handlePlay = (tmdbId: number) => {
    navigate(`/watch/${tmdbId}`);
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
              placeholder="Search movies and TV shows..."
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

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-destructive text-lg mb-2">Error: {error}</p>
            <p className="text-white/40 text-sm">Please try again</p>
          </div>
        )}

        {!loading && query && results.length === 0 && (
          <div className="text-center py-20">
            <p className="text-white/60 text-lg mb-2">No results for "{query}"</p>
            <p className="text-white/40 text-sm">Try a different search term</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <p className="text-white/50 text-sm mb-6">
              {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
              <span className="ml-2 text-white/30">
                ({results.filter((r) => r.type === "movie").length} movies,{" "}
                {results.filter((r) => r.type === "tv").length} TV shows)
              </span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.map((item) => (
                <SearchResultCard
                  key={`${item.type}-${item.tmdbId}`}
                  result={item}
                  onClick={handlePlay}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
