import { recover } from "../../shared/async.js";
import { requestJson } from "../../shared/http.js";
import type { IMDbGraphQLResponse, IMDbRequest } from "./types.js";

export const IMDB_GRAPHQL_ENDPOINT = "https://api.graphql.imdb.com/";

export function createIMDbProxyRequest(endpoint: string): IMDbRequest {
  return (query, signal) =>
    requestJson("IMDb", endpoint, { method: "POST", body: { query }, signal });
}

export async function executeIMDbQuery<T>(
  request: IMDbRequest,
  query: string,
  signal?: AbortSignal
): Promise<T> {
  const response = (await request(query, signal)) as IMDbGraphQLResponse<T>;
  if (!response.data || response.errors?.length) {
    throw new Error(
      response.errors?.map((error) => error.message).join("; ") || "IMDb API request failed"
    );
  }
  return response.data;
}

export function executeIMDbQueryOrDefault<T>(
  request: IMDbRequest,
  query: string,
  fallback: T,
  signal?: AbortSignal
): Promise<T> {
  return recover(() => executeIMDbQuery<T>(request, query, signal), fallback);
}
