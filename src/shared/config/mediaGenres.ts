export const MOVIE_GENRES = [
  { slug: "all", label: "All Movies", query: undefined, href: "/movies" },
  { slug: "action", label: "Action", query: "Action", href: "/movies?genre=Action" },
  { slug: "adventure", label: "Adventure", query: "Adventure", href: "/movies?genre=Adventure" },
  { slug: "animation", label: "Animation", query: "Animation", href: "/movies?genre=Animation" },
  { slug: "comedy", label: "Comedy", query: "Comedy", href: "/movies?genre=Comedy" },
  { slug: "crime", label: "Crime", query: "Crime", href: "/movies?genre=Crime" },
  {
    slug: "documentary",
    label: "Documentary",
    query: "Documentary",
    href: "/movies?genre=Documentary"
  },
  { slug: "drama", label: "Drama", query: "Drama", href: "/movies?genre=Drama" },
  { slug: "family", label: "Family", query: "Family", href: "/movies?genre=Family" },
  { slug: "fantasy", label: "Fantasy", query: "Fantasy", href: "/movies?genre=Fantasy" },
  { slug: "history", label: "History", query: "History", href: "/movies?genre=History" },
  { slug: "horror", label: "Horror", query: "Horror", href: "/movies?genre=Horror" },
  { slug: "music", label: "Music", query: "Music", href: "/movies?genre=Music" },
  { slug: "mystery", label: "Mystery", query: "Mystery", href: "/movies?genre=Mystery" },
  { slug: "romance", label: "Romance", query: "Romance", href: "/movies?genre=Romance" },
  {
    slug: "sci-fi",
    label: "Science Fiction",
    query: "Science Fiction",
    href: "/movies?genre=Science%20Fiction"
  },
  { slug: "tv-movie", label: "TV Movie", query: "TV Movie", href: "/movies?genre=TV%20Movie" },
  { slug: "thriller", label: "Thriller", query: "Thriller", href: "/movies?genre=Thriller" },
  { slug: "war", label: "War", query: "War", href: "/movies?genre=War" },
  { slug: "western", label: "Western", query: "Western", href: "/movies?genre=Western" }
] as const;

export const TV_GENRES = [
  { slug: "all", label: "All Shows", query: undefined, href: "/tv-shows" },
  {
    slug: "action-adventure",
    label: "Action & Adventure",
    query: "Action",
    href: "/tv-shows?genre=Action"
  },
  { slug: "animation", label: "Animation", query: "Animation", href: "/tv-shows?genre=Animation" },
  { slug: "comedy", label: "Comedy", query: "Comedy", href: "/tv-shows?genre=Comedy" },
  { slug: "crime", label: "Crime", query: "Crime", href: "/tv-shows?genre=Crime" },
  {
    slug: "documentary",
    label: "Documentary",
    query: "Documentary",
    href: "/tv-shows?genre=Documentary"
  },
  { slug: "drama", label: "Drama", query: "Drama", href: "/tv-shows?genre=Drama" },
  { slug: "family", label: "Family", query: "Family", href: "/tv-shows?genre=Family" },
  { slug: "kids", label: "Kids", query: "Kids", href: "/tv-shows?genre=Kids" },
  { slug: "mystery", label: "Mystery", query: "Mystery", href: "/tv-shows?genre=Mystery" },
  { slug: "news", label: "News", query: "News", href: "/tv-shows?genre=News" },
  { slug: "reality", label: "Reality", query: "Reality", href: "/tv-shows?genre=Reality" },
  {
    slug: "sci-fi-fantasy",
    label: "Sci-Fi & Fantasy",
    query: "Sci-Fi",
    href: "/tv-shows?genre=Sci-Fi"
  },
  { slug: "soap", label: "Soap", query: "Soap", href: "/tv-shows?genre=Soap" },
  { slug: "talk", label: "Talk", query: "Talk", href: "/tv-shows?genre=Talk" },
  { slug: "war-politics", label: "War & Politics", query: "War", href: "/tv-shows?genre=War" },
  { slug: "western", label: "Western", query: "Western", href: "/tv-shows?genre=Western" }
] as const;

export const ANIME_GENRES = [
  { slug: "all", label: "All Anime", query: undefined, href: "/anime" },
  { slug: "action", label: "Action", query: "action", href: "/anime?genre=action" },
  { slug: "adventure", label: "Adventure", query: "adventure", href: "/anime?genre=adventure" },
  { slug: "comedy", label: "Comedy", query: "comedy", href: "/anime?genre=comedy" },
  { slug: "drama", label: "Drama", query: "drama", href: "/anime?genre=drama" },
  { slug: "ecchi", label: "Ecchi", query: "ecchi", href: "/anime?genre=ecchi" },
  { slug: "fantasy", label: "Fantasy", query: "fantasy", href: "/anime?genre=fantasy" },
  { slug: "hentai", label: "Hentai", query: "hentai", href: "/anime?genre=hentai" },
  { slug: "horror", label: "Horror", query: "horror", href: "/anime?genre=horror" },
  {
    slug: "mahou-shoujo",
    label: "Mahou Shoujo",
    query: "mahou-shoujo",
    href: "/anime?genre=mahou-shoujo"
  },
  { slug: "mecha", label: "Mecha", query: "mecha", href: "/anime?genre=mecha" },
  { slug: "music", label: "Music", query: "music", href: "/anime?genre=music" },
  { slug: "mystery", label: "Mystery", query: "mystery", href: "/anime?genre=mystery" },
  {
    slug: "psychological",
    label: "Psychological",
    query: "psychological",
    href: "/anime?genre=psychological"
  },
  { slug: "romance", label: "Romance", query: "romance", href: "/anime?genre=romance" },
  { slug: "sci-fi", label: "Sci-Fi", query: "sci-fi", href: "/anime?genre=sci-fi" },
  {
    slug: "slice-of-life",
    label: "Slice of Life",
    query: "slice-of-life",
    href: "/anime?genre=slice-of-life"
  },
  { slug: "sports", label: "Sports", query: "sports", href: "/anime?genre=sports" },
  {
    slug: "supernatural",
    label: "Supernatural",
    query: "supernatural",
    href: "/anime?genre=supernatural"
  },
  { slug: "thriller", label: "Thriller", query: "thriller", href: "/anime?genre=thriller" }
] as const;

export const KITSU_ANIME_GENRES = [
  { slug: "all", label: "All Anime", query: undefined, href: "/anime" },
  { slug: "action", label: "Action", query: "action", href: "/anime?genre=action" },
  { slug: "adventure", label: "Adventure", query: "adventure", href: "/anime?genre=adventure" },
  { slug: "comedy", label: "Comedy", query: "comedy", href: "/anime?genre=comedy" },
  { slug: "drama", label: "Drama", query: "drama", href: "/anime?genre=drama" },
  { slug: "ecchi", label: "Ecchi", query: "ecchi", href: "/anime?genre=ecchi" },
  { slug: "fantasy", label: "Fantasy", query: "fantasy", href: "/anime?genre=fantasy" },
  { slug: "horror", label: "Horror", query: "horror", href: "/anime?genre=horror" },
  {
    slug: "magical-girl",
    label: "Magical Girl",
    query: "magical-girl",
    href: "/anime?genre=magical-girl"
  },
  { slug: "mecha", label: "Mecha", query: "mecha", href: "/anime?genre=mecha" },
  { slug: "music", label: "Music", query: "music", href: "/anime?genre=music" },
  { slug: "mystery", label: "Mystery", query: "mystery", href: "/anime?genre=mystery" },
  {
    slug: "psychological",
    label: "Psychological",
    query: "psychological",
    href: "/anime?genre=psychological"
  },
  { slug: "romance", label: "Romance", query: "romance", href: "/anime?genre=romance" },
  {
    slug: "science-fiction",
    label: "Science Fiction",
    query: "science-fiction",
    href: "/anime?genre=science-fiction"
  },
  {
    slug: "slice-of-life",
    label: "Slice of Life",
    query: "slice-of-life",
    href: "/anime?genre=slice-of-life"
  },
  { slug: "sports", label: "Sports", query: "sports", href: "/anime?genre=sports" },
  {
    slug: "supernatural",
    label: "Supernatural",
    query: "supernatural",
    href: "/anime?genre=supernatural"
  },
  { slug: "thriller", label: "Thriller", query: "thriller", href: "/anime?genre=thriller" },
  { slug: "isekai", label: "Isekai", query: "isekai", href: "/anime?genre=isekai" }
] as const;

export const JIKAN_ANIME_GENRES = [
  { slug: "all", label: "All Anime", query: undefined, href: "/anime" },
  { slug: "action", label: "Action", query: "action", href: "/anime?genre=action" },
  { slug: "adventure", label: "Adventure", query: "adventure", href: "/anime?genre=adventure" },
  {
    slug: "avant-garde",
    label: "Avant-Garde",
    query: "avant-garde",
    href: "/anime?genre=avant-garde"
  },
  {
    slug: "award-winning",
    label: "Award Winning",
    query: "award-winning",
    href: "/anime?genre=award-winning"
  },
  { slug: "boys-love", label: "Boys Love", query: "boys-love", href: "/anime?genre=boys-love" },
  { slug: "comedy", label: "Comedy", query: "comedy", href: "/anime?genre=comedy" },
  { slug: "drama", label: "Drama", query: "drama", href: "/anime?genre=drama" },
  { slug: "ecchi", label: "Ecchi", query: "ecchi", href: "/anime?genre=ecchi" },
  { slug: "fantasy", label: "Fantasy", query: "fantasy", href: "/anime?genre=fantasy" },
  { slug: "girls-love", label: "Girls Love", query: "girls-love", href: "/anime?genre=girls-love" },
  { slug: "gourmet", label: "Gourmet", query: "gourmet", href: "/anime?genre=gourmet" },
  { slug: "hentai", label: "Hentai", query: "hentai", href: "/anime?genre=hentai" },
  { slug: "historical", label: "Historical", query: "historical", href: "/anime?genre=historical" },
  { slug: "josei", label: "Josei", query: "josei", href: "/anime?genre=josei" },
  { slug: "horror", label: "Horror", query: "horror", href: "/anime?genre=horror" },
  { slug: "isekai", label: "Isekai", query: "isekai", href: "/anime?genre=isekai" },
  { slug: "kids", label: "Kids", query: "kids", href: "/anime?genre=kids" },
  { slug: "magic", label: "Magic", query: "magic", href: "/anime?genre=magic" },
  {
    slug: "martial-arts",
    label: "Martial Arts",
    query: "martial-arts",
    href: "/anime?genre=martial-arts"
  },
  { slug: "mecha", label: "Mecha", query: "mecha", href: "/anime?genre=mecha" },
  { slug: "military", label: "Military", query: "military", href: "/anime?genre=military" },
  { slug: "music", label: "Music", query: "music", href: "/anime?genre=music" },
  { slug: "mystery", label: "Mystery", query: "mystery", href: "/anime?genre=mystery" },
  { slug: "parody", label: "Parody", query: "parody", href: "/anime?genre=parody" },
  {
    slug: "psychological",
    label: "Psychological",
    query: "psychological",
    href: "/anime?genre=psychological"
  },
  { slug: "romance", label: "Romance", query: "romance", href: "/anime?genre=romance" },
  { slug: "samurai", label: "Samurai", query: "samurai", href: "/anime?genre=samurai" },
  { slug: "school", label: "School", query: "school", href: "/anime?genre=school" },
  { slug: "sci-fi", label: "Sci-Fi", query: "sci-fi", href: "/anime?genre=sci-fi" },
  { slug: "seinen", label: "Seinen", query: "seinen", href: "/anime?genre=seinen" },
  { slug: "shoujo", label: "Shoujo", query: "shoujo", href: "/anime?genre=shoujo" },
  { slug: "shounen", label: "Shounen", query: "shounen", href: "/anime?genre=shounen" },
  {
    slug: "slice-of-life",
    label: "Slice of Life",
    query: "slice-of-life",
    href: "/anime?genre=slice-of-life"
  },
  { slug: "sports", label: "Sports", query: "sports", href: "/anime?genre=sports" },
  {
    slug: "super-power",
    label: "Super Power",
    query: "super-power",
    href: "/anime?genre=super-power"
  },
  {
    slug: "supernatural",
    label: "Supernatural",
    query: "supernatural",
    href: "/anime?genre=supernatural"
  },
  { slug: "suspense", label: "Suspense", query: "suspense", href: "/anime?genre=suspense" },
  { slug: "vampire", label: "Vampire", query: "vampire", href: "/anime?genre=vampire" },
  { slug: "yaoi", label: "Yaoi", query: "yaoi", href: "/anime?genre=yaoi" },
  { slug: "yuri", label: "Yuri", query: "yuri", href: "/anime?genre=yuri" }
] as const;
