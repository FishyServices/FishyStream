import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getOneFrom } from "convex-helpers/server/relationships";
import { internalMutation, mutation as rawMutation, query } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { QueryCtx } from "../../_generated/server";
import {
  fromImageWire,
  parseContentId,
  toImageWire,
  type ContentType
} from "@content/contentMetadata";
import { foldersByUser, mutation } from "../../aggregates";

const folderNameValidator = v.string();
const MAX_SCAN_ROWS = 300;
const FOLDER_COUNTS_MAINTENANCE_KEY = "watchlist-folder-counts-v1";
const MAINTENANCE_LEASE_MS = 60_000;

function normalizeFolderName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

function toStoredFolder(selector: string | null) {
  return selector === null ? undefined : selector;
}

function entriesForFolder(ctx: QueryCtx, clerkUserId: string, selector: string | null | undefined) {
  if (selector === undefined) {
    return ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added", (q) => q.eq("clerkUserId", clerkUserId).gt("addedAt", 0))
      .order("desc");
  }
  return ctx.db
    .query("watchlist")
    .withIndex("by_clerk_folder", (q) =>
      q.eq("clerkUserId", clerkUserId).eq("folder", toStoredFolder(selector))
    )
    .order("desc");
}

async function locateEntry(ctx: QueryCtx, clerkUserId: string, contentId: string) {
  return ctx.db
    .query("watchlist")
    .withIndex("by_clerk_content", (q) =>
      q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
    )
    .first();
}

function locateContent(ctx: QueryCtx, contentId: string) {
  return getOneFrom(ctx.db, "watchlistContent", "by_content", contentId, "contentId");
}

function buildGridItem(
  entry: { contentId: string; folder?: string },
  content: { title: string; posterUrl: string }
) {
  const parsed = parseContentId(entry.contentId);
  return {
    _id: entry.contentId,
    title: content.title,
    type: parsed?.type || "movie",
    posterUrl: fromImageWire(content.posterUrl),
    tmdbId: parsed?.tmdbId || "",
    watchlistFolder: entry.folder
  };
}

async function hydrate(ctx: QueryCtx, entries: Array<{ contentId: string; folder?: string }>) {
  const uniqueContentIds = Array.from(new Set(entries.map((entry) => entry.contentId)));
  const resolved = await Promise.all(
    uniqueContentIds.map(
      async (contentId) => [contentId, await locateContent(ctx, contentId)] as const
    )
  );
  const contentById = new Map(resolved);
  const items: ReturnType<typeof buildGridItem>[] = [];
  for (const entry of entries) {
    const content = contentById.get(entry.contentId);
    if (content) items.push(buildGridItem(entry, content));
  }
  return items;
}

async function aggregateFolderSummary(ctx: QueryCtx, clerkUserId: string) {
  const counts = new Map<string, number>();
  let total = 0;
  let unsorted = 0;
  for await (const item of foldersByUser.iter(ctx, {
    namespace: clerkUserId,
    pageSize: 256,
    stale: true
  })) {
    total += 1;
    if (item.key) counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
    else unsorted += 1;
  }
  return {
    total,
    unsorted,
    folders: Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

async function findByTitle(
  ctx: QueryCtx,
  clerkUserId: string,
  term: string,
  selector: string | null | undefined
) {
  const rows = await entriesForFolder(ctx, clerkUserId, selector).take(MAX_SCAN_ROWS);
  const hydrated = await hydrate(ctx, rows);
  const needle = term.toLowerCase();
  const matches: typeof hydrated = [];
  for (const item of hydrated) if (item.title.toLowerCase().includes(needle)) matches.push(item);
  return matches;
}

export const listWatchlist = query({
  args: {
    clerkUserId: v.string(),
    paginationOpts: paginationOptsValidator,
    folder: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string())
  },
  handler: async (ctx, { clerkUserId, paginationOpts, folder, search }) => {
    const term = search?.trim();
    if (term) {
      const matches = await findByTitle(ctx, clerkUserId, term, folder);
      const cursor = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor);
      const start = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
      const end = start + paginationOpts.numItems;
      return {
        page: matches.slice(start, end),
        isDone: end >= matches.length,
        continueCursor: String(end)
      };
    }
    const paged = await entriesForFolder(ctx, clerkUserId, folder).paginate(paginationOpts);
    return { ...paged, page: await hydrate(ctx, paged.page) };
  }
});

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const rows = await entriesForFolder(ctx, clerkUserId, undefined).collect();
    return rows.map((row) => row.contentId);
  }
});

export const listRecommendationSeeds = query({
  args: { clerkUserId: v.string(), folder: v.optional(v.string()) },
  handler: async (ctx, { clerkUserId, folder }) => {
    const rows = await entriesForFolder(ctx, clerkUserId, folder).take(160);
    const seeds: Array<{ tmdbId: string; type: ContentType }> = [];
    for (const row of rows) {
      const parsed = parseContentId(row.contentId);
      if (parsed) seeds.push({ tmdbId: parsed.tmdbId, type: parsed.type });
    }
    return seeds;
  }
});

export const listFolders = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) =>
    (await aggregateFolderSummary(ctx, clerkUserId)).folders.map((folder) => folder.name)
});

export const listWatchlistSummary = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => aggregateFolderSummary(ctx, clerkUserId)
});

export const ensureFolderCounts = rawMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("watchlistMaintenance")
      .withIndex("by_key", (q) => q.eq("key", FOLDER_COUNTS_MAINTENANCE_KEY))
      .first();
    const now = Date.now();
    if (
      existing?.state === "complete" ||
      (existing?.state === "running" && now - existing.startedAt < MAINTENANCE_LEASE_MS)
    ) {
      return;
    }

    if (existing) {
      await ctx.db.patch(existing._id, { state: "running", startedAt: now });
    } else {
      await ctx.db.insert("watchlistMaintenance", {
        key: FOLDER_COUNTS_MAINTENANCE_KEY,
        state: "running",
        startedAt: now
      });
    }
    await ctx.scheduler.runAfter(0, internal.domains.watchlist.watchlist.backfillFolderCounts, {});
  }
});

export const backfillFolderCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    await foldersByUser.clearAll(ctx);
    const rows = await ctx.db.query("watchlist").collect();
    for (const row of rows) await foldersByUser.insertIfDoesNotExist(ctx, row);
    const marker = await ctx.db
      .query("watchlistMaintenance")
      .withIndex("by_key", (q) => q.eq("key", FOLDER_COUNTS_MAINTENANCE_KEY))
      .first();
    if (marker) await ctx.db.patch(marker._id, { state: "complete", completedAt: Date.now() });
  }
});

export const deleteFolder = mutation({
  args: { clerkUserId: v.string(), name: folderNameValidator },
  handler: async (ctx, { clerkUserId, name }) => {
    const rows = await entriesForFolder(ctx, clerkUserId, normalizeFolderName(name)).collect();
    await Promise.all(rows.map((row) => ctx.db.patch(row._id, { folder: undefined })));
  }
});

export const renameFolder = mutation({
  args: { clerkUserId: v.string(), from: folderNameValidator, to: folderNameValidator },
  handler: async (ctx, { clerkUserId, from, to }) => {
    const source = normalizeFolderName(from);
    const target = normalizeFolderName(to);
    if (!source || !target || source === target) return;
    const rows = await entriesForFolder(ctx, clerkUserId, source).collect();
    await Promise.all(rows.map((row) => ctx.db.patch(row._id, { folder: target })));
  }
});

export const removeWatchlistEntries = mutation({
  args: { clerkUserId: v.string(), contentIds: v.array(v.string()) },
  handler: async (ctx, { clerkUserId, contentIds }) => {
    const uniqueIds = Array.from(new Set(contentIds));
    const rows = await Promise.all(uniqueIds.map((id) => locateEntry(ctx, clerkUserId, id)));
    await Promise.all(
      rows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map((row) => ctx.db.delete(row._id))
    );
  }
});

export const setWatchlistFolderForEntries = mutation({
  args: {
    clerkUserId: v.string(),
    contentIds: v.array(v.string()),
    folder: v.optional(folderNameValidator)
  },
  handler: async (ctx, { clerkUserId, contentIds, folder }) => {
    const normalized = folder ? normalizeFolderName(folder) : undefined;
    const uniqueIds = Array.from(new Set(contentIds));
    const rows = await Promise.all(uniqueIds.map((id) => locateEntry(ctx, clerkUserId, id)));
    await Promise.all(
      rows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map((row) => ctx.db.patch(row._id, { folder: normalized }))
    );
  }
});

export const toggleWatchlistEntry = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.string(),
    title: v.string(),
    posterUrl: v.string(),
    inWatchlist: v.boolean()
  },
  handler: async (ctx, args) => {
    const existing = await locateEntry(ctx, args.clerkUserId, args.contentId);
    if (existing && !args.inWatchlist) {
      await ctx.db.delete(existing._id);
      return;
    }
    if (!args.inWatchlist) return;

    const wirePoster = toImageWire(args.posterUrl);
    const content = await locateContent(ctx, args.contentId);
    if (!content) {
      await ctx.db.insert("watchlistContent", {
        contentId: args.contentId,
        title: args.title,
        posterUrl: wirePoster
      });
    } else if (content.title !== args.title || content.posterUrl !== wirePoster) {
      await ctx.db.patch(content._id, { title: args.title, posterUrl: wirePoster });
    }
    if (!existing) {
      await ctx.db.insert("watchlist", {
        clerkUserId: args.clerkUserId,
        contentId: args.contentId,
        addedAt: Date.now()
      });
    }
  }
});

export const setWatchlistFolder = mutation({
  args: { clerkUserId: v.string(), contentId: v.string(), folder: v.optional(folderNameValidator) },
  handler: async (ctx, { clerkUserId, contentId, folder }) => {
    const entry = await locateEntry(ctx, clerkUserId, contentId);
    if (!entry) throw new Error("Watchlist item not found");
    await ctx.db.patch(entry._id, { folder: folder ? normalizeFolderName(folder) : undefined });
  }
});
