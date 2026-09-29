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
  { slug: "all", label: "All Anime", query: "Animation", href: "/anime" },
  { slug: "action", label: "Action", query: "action", href: "/anime?genre=Action" },
  {
    slug: "adventure",
    label: "Adventure",
    query: "adventure",
    href: "/anime?genre=Adventure"
  },
  { slug: "comedy", label: "Comedy", query: "comedy", href: "/anime?genre=Comedy" },
  { slug: "drama", label: "Drama", query: "drama", href: "/anime?genre=Drama" },
  { slug: "fantasy", label: "Fantasy", query: "fantasy", href: "/anime?genre=Fantasy" },
  { slug: "historical", label: "Historical", query: "historical", href: "/anime?genre=Historical" },
  { slug: "horror", label: "Horror", query: "horror", href: "/anime?genre=Horror" },
  { slug: "isekai", label: "Isekai", query: "isekai", href: "/anime?genre=Isekai" },
  { slug: "mecha", label: "Mecha", query: "mecha", href: "/anime?genre=Mecha" },
  { slug: "music", label: "Music", query: "music", href: "/anime?genre=Music" },
  { slug: "mystery", label: "Mystery", query: "mystery", href: "/anime?genre=Mystery" },
  {
    slug: "psychological",
    label: "Psychological",
    query: "psychological",
    href: "/anime?genre=Psychological"
  },
  { slug: "romance", label: "Romance", query: "romance", href: "/anime?genre=Romance" },
  { slug: "school", label: "School", query: "school", href: "/anime?genre=School" },
  { slug: "sci-fi", label: "Sci-Fi", query: "sci-fi", href: "/anime?genre=Sci-Fi" },
  {
    slug: "slice-of-life",
    label: "Slice of Life",
    query: "slice-of-life",
    href: "/anime?genre=Slice%20of%20Life"
  },
  { slug: "sports", label: "Sports", query: "sports", href: "/anime?genre=Sports" },
  {
    slug: "supernatural",
    label: "Supernatural",
    query: "supernatural",
    href: "/anime?genre=Supernatural"
  },
  { slug: "thriller", label: "Thriller", query: "thriller", href: "/anime?genre=Thriller" }
] as const;
