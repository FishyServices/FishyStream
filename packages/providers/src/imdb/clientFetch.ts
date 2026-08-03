import type {
  IMDbClient,
  IMDbEpisodePage,
  IMDbGraphQLResponse,
  IMDbId,
  IMDbRating,
  IMDbRequest,
  IMDbTitle
} from "./types.js";

const TITLE_FIELDS = `
  id
  titleText { text }
  ratingsSummary { aggregateRating voteCount }
`;

type IMDbTitleNode = {
  id?: string;
  titleText?: { text?: string | null } | null;
  ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null } | null;
};

function asIMDbId(id: string | undefined): IMDbId | null {
  return id?.startsWith("tt") ? (id as IMDbId) : null;
}

function toRating(summary: IMDbTitleNode["ratingsSummary"]): IMDbRating | undefined {
  if (summary?.aggregateRating == null || summary.voteCount == null) return undefined;
  return { value: summary.aggregateRating, voteCount: summary.voteCount };
}

function toTitle(node: IMDbTitleNode | null | undefined): IMDbTitle | null {
  const id = asIMDbId(node?.id);
  const title = node?.titleText?.text;
  if (!id || !title) return null;
  return { id, title, rating: toRating(node.ratingsSummary) };
}

function graphqlError(errors: Array<{ message: string }> | undefined): Error {
  return new Error(errors?.map((error) => error.message).join("; ") || "IMDb API request failed");
}

export function createIMDbProxyRequest(endpoint: string): IMDbRequest {
  return async (query, signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal
    });
    if (!response.ok) throw new Error(`IMDb API proxy request failed (${response.status})`);
    return response.json();
  };
}

export function createIMDbClient(request: IMDbRequest): IMDbClient {
  async function execute<T>(query: string, signal?: AbortSignal): Promise<T> {
    const response = (await request(query, signal)) as IMDbGraphQLResponse<T>;
    if (response.errors?.length || !response.data) throw graphqlError(response.errors);
    return response.data;
  }

  return {
    async getTitle(id, signal) {
      const data = await execute<{ title?: IMDbTitleNode | null }>(
        `query { title(id: "${id}") { ${TITLE_FIELDS} } }`,
        signal
      );
      return toTitle(data.title);
    },

    async getTitleRating(id, signal) {
      const data = await execute<{ title?: Pick<IMDbTitleNode, "ratingsSummary"> | null }>(
        `query { title(id: "${id}") { ratingsSummary { aggregateRating voteCount } } }`,
        signal
      );
      return toRating(data.title?.ratingsSummary) ?? null;
    },

    async getEpisodePage(id, cursor, signal) {
      const after = cursor ? `, after: "${cursor}"` : "";
      const data = await execute<{
        title?: {
          episodes?: {
            episodes?: {
              edges?: Array<{ node?: IMDbTitleNode | null } | null> | null;
              pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
            } | null;
          } | null;
        } | null;
      }>(
        `query { title(id: "${id}") { episodes { episodes(first: 250${after}) { edges { node { ${TITLE_FIELDS} } } pageInfo { endCursor hasNextPage } } } } }`,
        signal
      );
      const page = data.title?.episodes?.episodes;
      const episodes = (page?.edges ?? [])
        .map((edge) => toTitle(edge?.node))
        .filter((episode): episode is IMDbTitle => !!episode);
      return {
        episodes,
        nextCursor: page?.pageInfo?.hasNextPage
          ? (page.pageInfo?.endCursor ?? undefined)
          : undefined
      } satisfies IMDbEpisodePage;
    }
  };
}
