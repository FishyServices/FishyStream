import type {
  Episode,
  IMDbGraphQLResponse,
  IMDbRequest,
  MetadataClient,
  Rating,
  Title
} from "./types.js";

type Node = {
  id?: string;
  titleText?: { text?: string | null } | null;
  ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null } | null;
};
const fields = "id titleText { text } ratingsSummary { aggregateRating voteCount }";
const asId = (id?: string): `tt${string}` | null =>
  id?.startsWith("tt") ? (id as `tt${string}`) : null;
const rating = (node?: Node | null): Rating | undefined =>
  node?.ratingsSummary?.aggregateRating == null
    ? undefined
    : {
        value: node.ratingsSummary.aggregateRating,
        voteCount: node.ratingsSummary.voteCount ?? undefined
      };
const title = (node?: Node | null): Title | null => {
  const id = asId(node?.id);
  const text = node?.titleText?.text;
  return id && text ? { id, title: text, rating: rating(node) } : null;
};
export function createIMDbProxyRequest(endpoint: string): IMDbRequest {
  return async (query, signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal
    });
    if (!response.ok) throw new Error(`IMDb API request failed (${response.status})`);
    return response.json();
  };
}
export function createIMDbClient(request: IMDbRequest): MetadataClient {
  const execute = async <T>(query: string, signal?: AbortSignal) => {
    const response = (await request(query, signal)) as IMDbGraphQLResponse<T>;
    if (!response.data || response.errors?.length)
      throw new Error(
        response.errors?.map((error) => error.message).join("; ") || "IMDb API request failed"
      );
    return response.data;
  };
  return {
    async getTitle(reference, signal) {
      const data = await execute<{ title?: Node | null }>(
        `query { title(id: "${reference.id}") { ${fields} } }`,
        signal
      );
      const value = title(data.title);
      return value ? { ...value, type: reference.type } : null;
    },
    async getTitleRating(reference, signal) {
      const data = await execute<{ title?: Node | null }>(
        `query { title(id: "${reference.id}") { ratingsSummary { aggregateRating voteCount } } }`,
        signal
      );
      return rating(data.title) ?? null;
    },
    async getEpisodePage(reference, signal) {
      const after = reference.cursor ? `, after: "${reference.cursor}"` : "";
      const data = await execute<{
        title?: {
          episodes?: {
            episodes?: {
              edges?: Array<{ node?: Node | null }>;
              pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null };
            };
          };
        };
      }>(
        `query { title(id: "${reference.id}") { episodes { episodes(first: 250${after}) { edges { node { ${fields} } } pageInfo { endCursor hasNextPage } } } } }`,
        signal
      );
      const page = data.title?.episodes?.episodes;
      const episodes: Episode[] = (page?.edges ?? [])
        .map((edge) => title(edge.node))
        .filter((value): value is Title => !!value)
        .map((value) => ({ ...value, type: reference.type }));
      return {
        episodes,
        nextCursor: page?.pageInfo?.hasNextPage ? (page.pageInfo.endCursor ?? undefined) : undefined
      };
    }
  };
}
