import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { action, internalMutation, internalQuery } from "../../_generated/server";
import { viewerMutation, viewerQuery } from "../../lib/auth";
import { getAniListMediaById, resolveAniListId } from "@fishy/providers/anime/anilist";
import { decryptCredential, encryptCredential } from "./credentialCrypto";

const provider = v.union(v.literal("anilist"), v.literal("myanimelist"));
type Provider = "anilist" | "myanimelist";

export const list = viewerQuery({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db
      .query("animeAccounts")
      .withIndex("by_clerk_provider", (q) => q.eq("clerkUserId", ctx.viewerId))
      .collect();
    return accounts.map(({ _id, provider, externalUserId, username, syncEnabled, connectedAt }) => ({
      _id,
      provider,
      externalUserId,
      username,
      syncEnabled: syncEnabled ?? false,
      connectedAt
    }));
  }
});

export const setSyncEnabled = viewerMutation({
  args: { provider, enabled: v.boolean() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("animeAccounts")
      .withIndex("by_clerk_provider", (q) =>
        q.eq("clerkUserId", ctx.viewerId).eq("provider", args.provider)
      )
      .unique();
    if (!account) throw new Error("Connect this account before enabling progress sync");
    await ctx.db.patch(account._id, { syncEnabled: args.enabled });
  }
});

export const remove = viewerMutation({
  args: { provider },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("animeAccounts")
      .withIndex("by_clerk_provider", (q) =>
        q.eq("clerkUserId", ctx.viewerId).eq("provider", args.provider)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  }
});

export const finishAniListConnection = action({
  args: { accessToken: v.string() },
  handler: async (ctx, { accessToken }): Promise<{ username: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in before connecting AniList");
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query: "query { Viewer { id name } }" })
    });
    if (!response.ok) throw new Error("Could not read your AniList profile");
    const result = (await response.json()) as {
      data?: { Viewer?: { id?: number; name?: string } };
    };
    const viewer = result.data?.Viewer;
    if (viewer?.id == null || !viewer.name) throw new Error("AniList returned an invalid profile");
    await ctx.runMutation(internal.domains.accounts.animeAccounts.saveForViewer, {
      clerkUserId: identity.subject,
      provider: "anilist",
      externalUserId: String(viewer.id),
      username: viewer.name,
      encryptedCredential: await encryptCredential({ accessToken })
    });
    return { username: viewer.name };
  }
});

export const finishMyAnimeListConnection = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    clientId: v.string(),
    redirectUri: v.string()
  },
  handler: async (ctx, args): Promise<{ username: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in before connecting MyAnimeList");
    const tokenResponse = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: args.clientId,
        code: args.code,
        code_verifier: args.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: args.redirectUri
      })
    });
    if (!tokenResponse.ok) throw new Error("MyAnimeList authorization could not be completed");
    const token = (await tokenResponse.json()) as MalToken;
    if (!token.access_token || !token.refresh_token)
      throw new Error("MyAnimeList did not return usable credentials");
    const profileResponse = await fetch("https://api.myanimelist.net/v2/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!profileResponse.ok) throw new Error("Could not read your MyAnimeList profile");
    const profile = (await profileResponse.json()) as { id?: number; name?: string };
    if (profile.id == null || !profile.name)
      throw new Error("MyAnimeList returned an invalid profile");
    await ctx.runMutation(internal.domains.accounts.animeAccounts.saveForViewer, {
      clerkUserId: identity.subject,
      provider: "myanimelist",
      externalUserId: String(profile.id),
      username: profile.name,
      encryptedCredential: await encryptCredential({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in ?? 0) * 1000,
        clientId: args.clientId
      })
    });
    return { username: profile.name };
  }
});

type MalToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export const syncAll = action({
  args: { provider },
  handler: async (ctx, args): Promise<{ synced: number; changed: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in before syncing anime progress");
    const account = await ctx.runQuery(internal.domains.accounts.animeAccounts.getForViewer, {
      clerkUserId: identity.subject,
      provider: args.provider
    });
    if (!account?.encryptedCredential) throw new Error("Reconnect this account before syncing");
    const rows = await ctx.runQuery(internal.domains.accounts.animeAccounts.progressForViewer, {
      clerkUserId: identity.subject
    });
    const matched = await syncProvider(args.provider, account.encryptedCredential, rows);
    if (matched.credential) {
      await ctx.runMutation(internal.domains.accounts.animeAccounts.updateCredential, {
        accountId: account._id,
        encryptedCredential: matched.credential
      });
    }
    if (matched.localUpdates.length) {
      await ctx.runMutation(internal.domains.accounts.animeAccounts.applyProgressUpdates, {
        updates: matched.localUpdates
      });
    }
    return { synced: matched.synced, changed: matched.localUpdates.length };
  }
});

export const syncOne = action({
  args: { provider, contentId: v.string() },
  handler: async (ctx, args): Promise<{ synced: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in before syncing anime progress");
    const account = await ctx.runQuery(internal.domains.accounts.animeAccounts.getForViewer, {
      clerkUserId: identity.subject,
      provider: args.provider
    });
    if (!account?.encryptedCredential) throw new Error("Reconnect this account before syncing");
    const row = await ctx.runQuery(internal.domains.accounts.animeAccounts.progressEntryForViewer, {
      clerkUserId: identity.subject,
      contentId: args.contentId
    });
    if (!row) return { synced: 0 };
    const matched = await syncProvider(args.provider, account.encryptedCredential, [row]);
    if (matched.credential) {
      await ctx.runMutation(internal.domains.accounts.animeAccounts.updateCredential, {
        accountId: account._id,
        encryptedCredential: matched.credential
      });
    }
    if (matched.localUpdates.length) {
      await ctx.runMutation(internal.domains.accounts.animeAccounts.applyProgressUpdates, {
        updates: matched.localUpdates
      });
    }
    return { synced: matched.synced };
  }
});

type LocalProgress = {
  _id: Id<"mediaState">;
  title: string;
  seasonNumber?: number;
  episodeNumber?: number;
  positionSeconds?: number;
  durationSeconds?: number;
  watchedAt?: number;
};

type LocalUpdate = {
  id: Id<"mediaState">;
  episodeNumber: number;
  completed: boolean;
};

async function syncProvider(provider: Provider, encryptedCredential: string, rows: LocalProgress[]) {
  const credentials = await decryptCredential<Record<string, string | number>>(encryptedCredential);
  let aniListToken = String(credentials.accessToken ?? "");
  let malToken = String(credentials.accessToken ?? "");
  let newCredential: string | undefined;
  if (provider === "myanimelist") {
    const expiresAt = Number(credentials.expiresAt ?? 0);
    if (expiresAt < Date.now() + 30_000) {
      const response = await fetch("https://myanimelist.net/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: String(credentials.clientId),
          grant_type: "refresh_token",
          refresh_token: String(credentials.refreshToken)
        })
      });
      if (!response.ok) throw new Error("MyAnimeList authorization expired; reconnect the account");
      const refreshed = (await response.json()) as MalToken;
      if (!refreshed.access_token || !refreshed.refresh_token)
        throw new Error("MyAnimeList did not refresh its credentials");
      credentials.accessToken = refreshed.access_token;
      credentials.refreshToken = refreshed.refresh_token;
      credentials.expiresAt = Date.now() + (refreshed.expires_in ?? 0) * 1000;
      malToken = refreshed.access_token;
      newCredential = await encryptCredential(credentials);
    }
  }

  const localUpdates: LocalUpdate[] = [];
  let synced = 0;
  const externalItems =
    provider === "anilist"
      ? await loadAniListEntries(aniListToken)
      : await loadMalEntries(malToken);
  for (const row of rows) {
    if (!row.title.trim()) continue;
    const animeId = await resolveAniListId({
      title: row.title,
      season: row.seasonNumber ?? 1,
      mediaType: "tv"
    }).catch(() => null);
    if (!animeId) continue;
    const media = await getAniListMediaById(animeId).catch(() => null);
    if (!media) continue;
    const targetId = provider === "anilist" ? String(media.id) : String(media.idMal ?? "");
    if (!targetId) continue;
    const item = externalItems.get(targetId);
    const localEpisode = row.episodeNumber ?? 0;
    const externalEpisode = item?.progress ?? 0;
    const maxEpisode = Math.max(localEpisode, externalEpisode);
    const completed = Boolean(item?.completed) || (media.episodes != null && maxEpisode >= media.episodes);
    if (provider === "anilist") {
      const result = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aniListToken}` },
        body: JSON.stringify({
          query: "mutation ($mediaId: Int!, $progress: Int!, $status: MediaListStatus) { SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id } }",
          variables: {
            mediaId: media.id,
            progress: maxEpisode,
            status: completed ? "COMPLETED" : maxEpisode ? "CURRENT" : undefined
          }
        })
      });
      if (!result.ok) continue;
    } else {
      const response = await fetch(`https://api.myanimelist.net/v2/anime/${targetId}/my_list_status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${malToken}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          num_watched_episodes: String(maxEpisode),
          ...(completed ? { status: "completed" } : maxEpisode ? { status: "watching" } : {})
        })
      });
      if (!response.ok) continue;
    }
    synced += 1;
    if (maxEpisode > localEpisode) localUpdates.push({ id: row._id, episodeNumber: maxEpisode, completed });
  }
  return { synced, localUpdates, credential: newCredential };
}

async function loadAniListEntries(token: string) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: "query { Viewer { id } }"
    })
  });
  if (!response.ok) throw new Error("Could not read AniList progress");
  const result = (await response.json()) as {
    data?: { Viewer?: { id?: number }; MediaListCollection?: { lists?: Array<{ entries?: Array<{ progress?: number; status?: string; media?: { id?: number } }> }> } };
  };
  const userId = result.data?.Viewer?.id;
  if (userId == null) throw new Error("Could not identify the AniList account");
  const listResponse = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: "query ($userId: Int!) { MediaListCollection(userId: $userId, type: ANIME) { lists { entries { progress status media { id } } } } }",
      variables: { userId }
    })
  });
  if (!listResponse.ok) throw new Error("Could not read AniList progress");
  const listResult = (await listResponse.json()) as typeof result;
  const items = new Map<string, { progress: number; completed: boolean }>();
  for (const list of listResult.data?.MediaListCollection?.lists ?? []) {
    for (const entry of list.entries ?? []) {
      if (entry.media?.id != null) items.set(String(entry.media.id), {
        progress: entry.progress ?? 0,
        completed: entry.status === "COMPLETED"
      });
    }
  }
  return items;
}

async function loadMalEntries(token: string) {
  const items = new Map<string, { progress: number; completed: boolean }>();
  let next: string | null = "https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status&limit=1000";
  while (next) {
    const response: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Could not read MyAnimeList progress");
    const result = (await response.json()) as {
      data?: Array<{ node?: { id?: number }; list_status?: { status?: string; num_episodes_watched?: number } }>;
      paging?: { next?: string };
    };
    for (const entry of result.data ?? []) {
      if (entry.node?.id != null) items.set(String(entry.node.id), {
        progress: entry.list_status?.num_episodes_watched ?? 0,
        completed: entry.list_status?.status === "completed"
      });
    }
    next = result.paging?.next ?? null;
  }
  return items;
}

export const getForViewer = internalQuery({
  args: { clerkUserId: v.string(), provider },
  handler: async (ctx, args) =>
    ctx.db
      .query("animeAccounts")
      .withIndex("by_clerk_provider", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("provider", args.provider)
      )
      .unique()
});

export const progressForViewer = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", args.clerkUserId).gt("watchedAt", 0))
      .collect()
});

export const progressEntryForViewer = internalQuery({
  args: { clerkUserId: v.string(), contentId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("contentId", args.contentId)
      )
      .first()
});

export const saveForViewer = internalMutation({
  args: {
    clerkUserId: v.string(),
    provider,
    externalUserId: v.string(),
    username: v.string(),
    encryptedCredential: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("animeAccounts")
      .withIndex("by_clerk_provider", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("provider", args.provider)
      )
      .unique();
    const record = { ...args, connectedAt: Date.now(), syncEnabled: existing?.syncEnabled ?? false };
    if (existing) await ctx.db.patch(existing._id, record);
    else await ctx.db.insert("animeAccounts", record);
  }
});

export const updateCredential = internalMutation({
  args: { accountId: v.id("animeAccounts"), encryptedCredential: v.string() },
  handler: (ctx, args) => ctx.db.patch(args.accountId, { encryptedCredential: args.encryptedCredential })
});

export const applyProgressUpdates = internalMutation({
  args: { updates: v.array(v.object({ id: v.id("mediaState"), episodeNumber: v.number(), completed: v.boolean() })) },
  handler: async (ctx, { updates }) => {
    for (const update of updates) {
      const row = await ctx.db.get(update.id);
      if (!row) continue;
      await ctx.db.patch(update.id, {
        episodeNumber: update.episodeNumber,
        positionSeconds: update.completed ? (row.durationSeconds ?? 1) : 0,
        durationSeconds: row.durationSeconds ?? 1,
        watchedAt: Date.now()
      });
    }
  }
});
