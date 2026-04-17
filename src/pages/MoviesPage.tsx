import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Film, Filter, ChevronDown } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMovies, useContentByGenre } from "@/hooks/useContent";

const GENRES = [
  "All",
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Sci-Fi",
  "Thriller",
  "Animation",
  "Documentary",
  "Romance",
  "Fantasy",
  "Crime",
  "Adventure"
];
const SORTS = [
  { label: "Popular", value: "popular" },
  { label: "New Releases", value: "new" },
  { label: "Top Rated", value: "rating" },
  { label: "Year", value: "year" }
];

export function MoviesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortOpen, setSortOpen] = useState(false);

  const genre = searchParams.get("genre") ?? "All";
  const sort = (searchParams.get("sort") ?? "popular") as "popular" | "new" | "rating" | "year";

  const allMovies = useMovies(120);
  const genreMovies = useContentByGenre(genre !== "All" ? genre : "");

  const rawMovies = genre !== "All" ? genreMovies : allMovies;

  const sortedMovies = rawMovies
    ? [...rawMovies].sort((a, b) => {
        if (sort === "rating") return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
        if (sort === "year") return b.year - a.year;
        if (sort === "new") return (b.new ? 1 : 0) - (a.new ? 1 : 0);
        return (b.popular ? 1 : 0) - (a.popular ? 1 : 0);
      })
    : undefined;

  const currentSort = SORTS.find((s) => s.value === sort) ?? SORTS[0]!;

  const handlePlay = (tmdbId: string) => navigate(`/watch/${tmdbId}`);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 px-6 sm:px-10 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-black text-white">Movies</h1>
            {sortedMovies && (
              <p className="text-white/40 text-sm mt-1">{sortedMovies.length} titles</p>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            {/* Sort */}
            <div className="relative">
              <button
                className="flex items-center gap-2 px-3 py-2 glass rounded-lg border border-white/15 text-sm text-white/70 hover:text-white transition-colors"
                onClick={() => setSortOpen(!sortOpen)}
              >
                <Filter className="w-3.5 h-3.5" />
                {currentSort.label}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${sortOpen ? "rotate-180" : ""}`}
                />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-[hsl(220,16%,8%)] border border-white/15 rounded-lg shadow-2xl py-1 z-20">
                  {SORTS.map((s) => (
                    <button
                      key={s.value}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-white/8 transition-colors ${
                        s.value === sort ? "text-primary font-semibold" : "text-white/70"
                      }`}
                      onClick={() => {
                        setSearchParams((p) => {
                          p.set("sort", s.value);
                          return p;
                        });
                        setSortOpen(false);
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Genre pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-4 mb-6 -mx-6 sm:-mx-10 px-6 sm:px-10">
          {GENRES.map((g) => (
            <button
              key={g}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                genre === g
                  ? "bg-primary text-white"
                  : "glass border border-white/15 text-white/60 hover:text-white hover:border-white/30"
              }`}
              onClick={() => {
                setSearchParams((p) => {
                  g === "All" ? p.delete("genre") : p.set("genre", g);
                  return p;
                });
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Grid */}
        {sortedMovies === undefined ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sortedMovies.length === 0 ? (
          <div className="text-center py-16">
            <Film className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-white/40">No movies found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedMovies.map((movie) => (
              <MovieCard key={movie._id} content={movie} onPlay={handlePlay} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
