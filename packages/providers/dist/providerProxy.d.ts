export interface ProviderProxyMatch {
    prefix: string;
    subpath: string;
}
export interface ProviderProxyRequest {
    url: URL;
    method?: string;
    headers?: Headers;
    body?: BodyInit | null;
}
export declare const PROVIDER_PROXY_PREFIXES: readonly ["vidplays-proxy"];
export declare const PROVIDER_PROXY_PATH_ALIASES: Record<string, (segments: string[]) => string[]>;
export declare function matchProviderProxyPath(pathname: string): ProviderProxyMatch | null;
export declare function resolveProviderProxyPathFromSegments(segments: readonly string[]): string | null;
export declare function proxyProviderRequest({ url, method, headers, body }: ProviderProxyRequest): Promise<Response>;
