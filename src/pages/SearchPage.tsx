import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2, Search, X, Tv, Film, Star } from "lucide-react";
import { Header } from "@/components/Header";
import { useSearchAll, type SearchResult } from "@/hooks/useContent";
import { ContentModal } from "@/components/ContentModal";

function ResultCard({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="group cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 card-lift">
        <img
          src={
            imgError
              ? `https://placehold.co/300x450/1a1a2e/555?text=${encodeURIComponent(result.title.slice(0, 8))}`
              : result.posterUrl
          }
          alt={result.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-black/70 backdrop-blur rounded text-white/80">
            {result.type === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
            {result.type === "movie" ? "Movie" : "TV"}
          </span>
        </div>
        {/* Hover play */}
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
            <Film className="w-5 h-5 text-black" />
          </div>
        </div>
      </div>
      <h3 className="text-sm font-display font-semibold text-white truncate group-hover:text-primary transition-colors">
        {result.title}
      </h3>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-white/50">
        <span>{result.year}</span>
        {result.seasons && <span>{result.seasons} Seasons</span>}
        {result.voteAverage && result.voteAverage > 0 && (
          <span className="flex items-center gap-0.5 text-yellow-400">
            <Star className="w-2.5 h-2.5 fill-yellow-400" />
            {result.voteAverage.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") ?? "";
  const [input, setInput] = useState(query);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
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

      <main className="pt-24 px-6 sm:px-10 pb-16">
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
            <div className="flex items-center gap-4 mb-6 text-sm text-white/40">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 stagger-children">
              {results.map((item) => (
                <div key={`${item.type}-${item.tmdbId}`} className="animate-fade-in-up">
                  <ResultCard
                    result={item}
                    onClick={() => {
                      navigate(`/watch/${item.tmdbId}`);
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
