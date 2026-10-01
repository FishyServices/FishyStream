import type { StreamResult } from "../types";

export type ResolverEmbedReference = {
  embedId: string;
  url: string;
};

export type ResolverOutput = {
  streams?: StreamResult[];
  embeds: ResolverEmbedReference[];
};

export type ResolverContext = {
  targetUrl: string;
};

export type ResolverOptions = {
  id: string;
  name: string;
  disabled?: boolean;
  resolve: (context: ResolverContext) => Promise<ResolverOutput | null>;
};

export type Resolver = ResolverOptions & {
  disabled: boolean;
};

export function makeResolver(options: ResolverOptions): Resolver {
  return {
    ...options,
    disabled: options.disabled ?? false
  };
}
