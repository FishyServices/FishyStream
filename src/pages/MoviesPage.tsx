import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMovies } from "@/hooks/useContent";

export function MoviesPage() {
  const navigate = useNavigate();
  const movies = useMovies();

  const handlePlay = (tmdbId: string) => {
    navigate(`/watch/${tmdbId}`);
  };

  if (movies === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-24 px-4 sm:px-6 lg:px-12">
        <h1 className="text-3xl font-bold text-white mb-8">Movies</h1>
        
        {movies.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60">No movies available. Sync from TMDB to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map((movie) => (
              <MovieCard key={movie._id} content={movie} onPlay={handlePlay} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
