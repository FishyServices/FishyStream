import { requestJson, type Fetcher } from "../../shared/http.js";

export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

interface AniListResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string }>;
}

export async function queryAniList<T>(
  query: string,
  variables: Record<string, unknown>,
  fetcher?: Fetcher
): Promise<T> {
  const response = (await requestJson("AniList", ANILIST_ENDPOINT, {
    method: "POST",
    body: { query, variables },
    fetcher
  })) as AniListResponse<T>;
  if (response.errors?.length) {
    throw new Error(
      `AniList API returned an error: ${response.errors[0]?.message ?? "unknown error"}`
    );
  }
  if (!response.data) throw new Error("AniList returned no data");
  return response.data;
}
