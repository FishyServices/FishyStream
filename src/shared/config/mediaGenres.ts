export const MOVIE_GENRES = [
  { slug: "all", label: "All Movies", query: undefined, href: "/movies" },
  { slug: "action", label: "Action", query: "Action", href: "/movies?genre=Action" },
  { slug: "adventure", label: "Adventure", query: "Adventure", href: "/movies?genre=Adventure" },
  { slug: "comedy", label: "Comedy", query: "Comedy", href: "/movies?genre=Comedy" },
  { slug: "drama", label: "Drama", query: "Drama", href: "/movies?genre=Drama" },
  { slug: "fantasy", label: "Fantasy", query: "Fantasy", href: "/movies?genre=Fantasy" },
  { slug: "horror", label: "Horror", query: "Horror", href: "/movies?genre=Horror" },
  { slug: "sci-fi", label: "Sci-Fi", query: "Science Fiction", href: "/movies?genre=Sci-Fi" },
  { slug: "thriller", label: "Thriller", query: "Thriller", href: "/movies?genre=Thriller" },
  { slug: "romance", label: "Romance", query: "Romance", href: "/movies?genre=Romance" }
] as const;

export const TV_GENRES = [
  { slug: "all", label: "All Shows", query: undefined, href: "/tv-shows" },
  { slug: "action", label: "Action", query: "Action", href: "/tv-shows?genre=Action" },
  { slug: "adventure", label: "Adventure", query: "Adventure", href: "/tv-shows?genre=Adventure" },
  { slug: "comedy", label: "Comedy", query: "Comedy", href: "/tv-shows?genre=Comedy" },
  { slug: "drama", label: "Drama", query: "Drama", href: "/tv-shows?genre=Drama" },
  { slug: "fantasy", label: "Fantasy", query: "Fantasy", href: "/tv-shows?genre=Fantasy" },
  { slug: "horror", label: "Horror", query: "Horror", href: "/tv-shows?genre=Horror" },
  { slug: "sci-fi", label: "Sci-Fi", query: "Science Fiction", href: "/tv-shows?genre=Sci-Fi" },
  { slug: "crime", label: "Crime", query: "Crime", href: "/tv-shows?genre=Crime" },
  {
    slug: "documentary",
    label: "Documentary",
    query: "Documentary",
    href: "/tv-shows?genre=Documentary"
  }
] as const;

export const ANIME_GENRES = [
  { slug: "all", label: "All Anime", query: "Animation", href: "/anime/genre/all" },
  { slug: "action", label: "Action", query: "Animation,Action", href: "/anime/genre/action" },
  {
    slug: "adventure",
    label: "Adventure",
    query: "Animation,Adventure",
    href: "/anime/genre/adventure"
  },
  { slug: "comedy", label: "Comedy", query: "Animation,Comedy", href: "/anime/genre/comedy" },
  { slug: "drama", label: "Drama", query: "Animation,Drama", href: "/anime/genre/drama" },
  { slug: "fantasy", label: "Fantasy", query: "Animation,Fantasy", href: "/anime/genre/fantasy" },
  //{ slug: "horror", label: "Horror", query: null, href: "/anime/genre/horror" },
  //{ slug: "isekai", label: "Isekai", query: null, href: "/anime/genre/isekai" },
  { slug: "romance", label: "Romance", query: "Animation,Romance", href: "/anime/genre/romance" },
  /*
  {
    slug: "sci-fi",
    label: "Sci-Fi",
    query: "Animation,Science Fiction",
    href: "/anime/genre/sci-fi"
  },
  */
  { slug: "mystery", label: "Mystery", query: "Animation,Mystery", href: "/anime/genre/mystery" }
] as const;
