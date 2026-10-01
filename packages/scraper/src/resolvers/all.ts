import { makeResolver, type Resolver } from "./contracts";
import { resolveMegaPlay } from "./megaPlayResolver";
import { resolveVidLove } from "./vidLoveResolver";
import { resolveVidLux } from "./vidLuxResolver";
import { resolveVidNest } from "./vidNestResolver";
import { resolveVidRock } from "./vidRockResolver";
import { resolveVidZee } from "./vidZeeResolver";
import { resolveVidZen } from "./vidZenResolver";

const vidLove = makeResolver({
  id: "vidlove",
  name: "VidLove",
  resolve: async ({ targetUrl }) => {
    const stream = await resolveVidLove(targetUrl);
    return { streams: stream ? [stream] : [], embeds: [] };
  }
});

export const resolverSources: Resolver[] = [
  vidLove,
  makeResolver({
    id: "vidzen",
    name: "VidZen",
    resolve: async ({ targetUrl }) => {
      const stream = await resolveVidZen(targetUrl);
      return { streams: stream ? [stream] : [], embeds: [] };
    }
  }),
  makeResolver({
    id: "vidlux",
    name: "VidLux",
    resolve: async ({ targetUrl }) => {
      const stream = await resolveVidLux(targetUrl);
      return { streams: stream ? [stream] : [], embeds: [] };
    }
  }),
  makeResolver({
    id: "vidnest",
    name: "VidNest",
    resolve: async ({ targetUrl }) => {
      const stream = await resolveVidNest(targetUrl);
      return { streams: stream ? [stream] : [], embeds: [] };
    }
  }),
  makeResolver({
    id: "vidrock",
    name: "VidRock",
    resolve: async ({ targetUrl }) => {
      const stream = await resolveVidRock(targetUrl);
      return { streams: stream ? [stream] : [], embeds: [] };
    }
  }),
  makeResolver({
    id: "vidzee",
    name: "VidZee",
    resolve: async ({ targetUrl }) => {
      const stream = await resolveVidZee(targetUrl);
      return { streams: stream ? [stream] : [], embeds: [] };
    }
  }),
  makeResolver({
    id: "megaplay",
    name: "MegaPlay",
    resolve: async ({ targetUrl }) => {
      const stream = await resolveMegaPlay(targetUrl);
      return { streams: stream ? [stream] : [], embeds: [] };
    }
  })
];

export const resolverEmbeds: Resolver[] = [vidLove];
