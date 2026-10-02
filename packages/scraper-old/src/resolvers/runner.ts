import type { StreamResult } from "../types";
import type { Resolver, ResolverEmbedReference, ResolverOutput } from "./contracts";

export type ResolverRunResult = {
  resolverId: string;
  embedId?: string;
  stream: StreamResult;
};

function firstStream(output: ResolverOutput | null): StreamResult | null {
  const stream = output?.streams?.find((candidate) => candidate.url.length > 0);
  return stream ?? null;
}

function enabledResolvers(resolvers: Resolver[]): Resolver[] {
  return resolvers.filter((resolver) => !resolver.disabled);
}

async function runEmbeds(
  references: ResolverEmbedReference[],
  embeds: Resolver[]
): Promise<{ embedId: string; stream: StreamResult } | null> {
  const byId = new Map(enabledResolvers(embeds).map((embed) => [embed.id, embed]));
  for (const reference of references) {
    const embed = byId.get(reference.embedId);
    if (!embed) continue;
    try {
      const output = await embed.resolve({ targetUrl: reference.url });
      const stream = firstStream(output);
      if (stream) return { embedId: embed.id, stream };
    } catch {
      // One failed embed must not prevent the remaining providers from running.
    }
  }
  return null;
}

export async function runResolvers(
  targetUrl: string,
  options: { sources: Resolver[]; embeds?: Resolver[] }
): Promise<ResolverRunResult | null> {
  const embeds = options.embeds ?? [];
  for (const resolver of enabledResolvers(options.sources)) {
    let output: ResolverOutput | null;
    try {
      output = await resolver.resolve({ targetUrl });
    } catch {
      continue;
    }

    const directStream = firstStream(output);
    if (directStream) return { resolverId: resolver.id, stream: directStream };

    const nested = await runEmbeds(output?.embeds ?? [], embeds);
    if (nested) {
      return { resolverId: resolver.id, embedId: nested.embedId, stream: nested.stream };
    }
  }

  return null;
}
