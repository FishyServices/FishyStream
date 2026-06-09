export const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_BASE_URL_2 = "https://api.tmdb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics"
};

export const TMDB_DISCOVER_GENRES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  "science fiction": 878,
  "sci-fi": 878,
  thriller: 53,
  war: 10752,
  western: 37
};

export function getPosterUrl(path: string | null, size = "w500"): string {
  if (!path) return "https://placehold.co/500x750/1a1a2e/666?text=No+Poster";
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getBackdropUrl(path: string | null): string {
  if (!path) return "https://placehold.co/1920x1080/0a0a12/333?text=No+Backdrop";
  return `${TMDB_IMAGE_BASE}/original${path}`;
}

export function getStillUrl(path: string | null): string {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE}/w500${path}`;
}

export function getGenres(item: {
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
}): string[] {
  if (item.genres?.length) return item.genres.map((g) => g.name);
  return (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[];
}

export function getYear(date?: string): number {
  if (!date) return new Date().getFullYear();
  const year = parseInt(date.split("-")[0] ?? String(new Date().getFullYear()));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

export function getRating(voteAverage: number, certificationOrRating?: string | null): string {
  if (certificationOrRating) {
    const r = certificationOrRating.trim().toUpperCase();
    const known = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"];
    if (known.includes(r)) return r;
    if (r === "U" || r === "U/A") return "PG";
    if (r === "A") return "R";
    if (r === "18" || r === "18+") return "R";
    if (r === "15" || r === "16+") return "PG-13";
    if (r === "12" || r === "12A" || r === "13+") return "PG-13";
  }
  if (voteAverage >= 7.5) return "PG-13";
  if (voteAverage >= 5) return "PG";
  return "G";
}
