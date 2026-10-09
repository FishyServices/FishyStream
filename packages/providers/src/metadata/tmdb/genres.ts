import type { MediaType } from "../../shared/media.js";

export const TMDB_GENRE_NAMES: Readonly<Record<number, string>> = {
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
  53: "Thriller",
  10752: "War",
  37: "Western"
};

export const TMDB_GENRE_IDS: Readonly<Record<MediaType, Readonly<Record<string, number>>>> = {
  movie: {
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
  },
  tv: {
    action: 10759,
    adventure: 10759,
    animation: 16,
    comedy: 35,
    crime: 80,
    documentary: 99,
    drama: 18,
    family: 10751,
    fantasy: 10765,
    horror: 10765,
    mystery: 9648,
    romance: 10766,
    "science fiction": 10765,
    "sci-fi": 10765,
    thriller: 10765,
    war: 10768,
    western: 37
  }
};
