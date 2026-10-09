import type { MediaType } from "../../shared/media.js";
import {
  collectUniqueCards,
  currentYear,
  deriveAgeRating,
  PLACEHOLDER_POSTER_URL,
  type CollectOptions
} from "../helpers.js";
import type { Rating, Title } from "../types.js";
import type { IMDbTitleNode } from "./schema.js";
import type { IMDbContentCard, IMDbId, IMDbItem } from "./types.js";

export type IdentifiedNode = IMDbTitleNode & { id: string };

export function hasId(node?: IMDbTitleNode | null): node is IdentifiedNode {
  return !!node?.id;
}

export function asImdbId(id?: string): IMDbId | null {
  return id?.startsWith("tt") ? (id as IMDbId) : null;
}

export function nodeTitle(node?: IMDbTitleNode | null): string {
  return node?.titleText?.text ?? "";
}

export function nodeYear(node?: IMDbTitleNode | null): number {
  return node?.releaseYear?.year ?? node?.releaseDate?.year ?? currentYear();
}

export function nodePoster(node?: IMDbTitleNode | null): string {
  return node?.primaryImage?.url || PLACEHOLDER_POSTER_URL;
}

export function nodeGenres(node?: IMDbTitleNode | null): string[] {
  return (node?.genres?.genres ?? []).flatMap((genre) => genre.text ?? []);
}

export function nodeAgeRating(node?: IMDbTitleNode | null): string {
  return node?.certificate?.rating || deriveAgeRating(node?.ratingsSummary?.aggregateRating ?? 0);
}

export function nodeRating(node?: IMDbTitleNode | null): Rating | undefined {
  const summary = node?.ratingsSummary;
  if (summary?.aggregateRating == null) return undefined;
  return { value: summary.aggregateRating, voteCount: summary.voteCount ?? undefined };
}

export function toTitle(node?: IMDbTitleNode | null): Title | null {
  const id = asImdbId(node?.id);
  const title = nodeTitle(node);
  return id && title ? { id, title, rating: nodeRating(node) } : null;
}

export function toItem(node: IdentifiedNode, type: MediaType): IMDbItem {
  return {
    imdbId: node.id,
    type,
    title: nodeTitle(node),
    posterUrl: nodePoster(node),
    year: nodeYear(node),
    genre: nodeGenres(node),
    rating: nodeAgeRating(node),
    voteAverage: node.ratingsSummary?.aggregateRating ?? undefined
  };
}

export function toContentCard(
  node?: IMDbTitleNode | null,
  type?: MediaType
): IMDbContentCard | null {
  const id = asImdbId(node?.id);
  const title = nodeTitle(node);
  if (!node || !id || !title || !node.primaryImage?.url) return null;
  return {
    imdbId: id,
    type: type ?? (node.titleType?.text === "TV Series" ? "tv" : "movie"),
    title,
    year: nodeYear(node),
    posterUrl: node.primaryImage.url,
    voteAverage: node.ratingsSummary?.aggregateRating ?? undefined,
    genre: nodeGenres(node),
    isNew: false
  };
}

export function collectContentCards(
  responses: ReadonlyArray<{
    nodes: ReadonlyArray<IMDbTitleNode | null | undefined>;
    type?: MediaType;
  }>,
  options?: CollectOptions
): IMDbContentCard[] {
  const cards = responses.flatMap(({ nodes, type }) =>
    nodes.flatMap((node) => toContentCard(node, type) ?? [])
  );
  return collectUniqueCards(cards, (card) => card.imdbId, options);
}
