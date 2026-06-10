import { TMDB_IMAGE_BASE } from "./constants";
import type { TMDBLogo } from "./types";

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

export function getProfileUrl(path: string | null): string {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE}/w185${path}`;
}

export function getLogoUrl(logos: TMDBLogo[] | undefined): string | undefined {
  if (!logos?.length) return undefined;
  const en = logos
    .filter((l) => l.iso_639_1 === "en")
    .sort((a, b) => b.vote_average - a.vote_average)[0];
  const best = en ?? logos.sort((a, b) => b.vote_average - a.vote_average)[0];
  if (!best) return undefined;
  return `${TMDB_IMAGE_BASE}/w500${best.file_path}`;
}
