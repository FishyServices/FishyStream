export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type QueryParams = Record<string, string | number | boolean | undefined>;

export class HttpError extends Error {
  readonly service: string;
  readonly status: number;

  constructor(service: string, status: number, detail?: string) {
    super(
      detail
        ? `${service} request failed (${status}): ${detail}`
        : `${service} request failed (${status})`
    );
    this.name = "HttpError";
    this.service = service;
    this.status = status;
  }
}

export interface JsonRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  fetcher?: Fetcher;
}

export function buildUrl(base: string, path = "", params: QueryParams = {}): URL {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => "");
  return text.trim().slice(0, 180) || undefined;
}

export async function requestJson(
  service: string,
  url: string | URL,
  options: JsonRequestOptions = {}
): Promise<unknown> {
  const { method = "GET", body, headers, signal, fetcher = fetch } = options;
  const hasBody = body !== undefined;
  const response = await fetcher(String(url), {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: hasBody ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new HttpError(service, response.status, await readErrorDetail(response));
  return response.json();
}
