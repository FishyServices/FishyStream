import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query } from "../../_generated/server";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  fromImageWire,
  parseContentId,
  toImageWire,
  type ContentType
} from "@content/contentMetadata";

const folderNameValidator = v.string();
const MAX_SCAN_ROWS = 300;

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
  let unsorted = 0;
  const rows = await ctx.db
    .query("watchlist")
    .withIndex("by_clerk_folder", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();
  for (const row of rows) {
    if (row.folder) counts.set(row.folder, (counts.get(row.folder) ?? 0) + 1);
    else unsorted += 1;
  }
  return {
    total: rows.length,
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

async function getIdsDoc(ctx: QueryCtx, clerkUserId: string) {
  return ctx.db
    .query("watchlistIds")
    .withIndex("by_clerk", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
}

async function getCountsDoc(ctx: QueryCtx, clerkUserId: string) {
  return ctx.db
    .query("watchlistCounts")
    .withIndex("by_clerk", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
}

async function scanWatchlist(ctx: QueryCtx, clerkUserId: string) {
  return ctx.db
    .query("watchlist")
    .withIndex("by_clerk_added", (q) => q.eq("clerkUserId", clerkUserId).gt("addedAt", 0))
    .collect();
}

async function ensureIdsDoc(ctx: MutationCtx, clerkUserId: string) {
  const existing = await getIdsDoc(ctx, clerkUserId);
  if (existing) return existing;
  const rows = await scanWatchlist(ctx, clerkUserId);
  const _id = await ctx.db.insert("watchlistIds", {
    clerkUserId,
    contentIds: rows.map((row) => row.contentId)
  });
  return (await ctx.db.get(_id))!;
}

async function ensureCountsDoc(ctx: MutationCtx, clerkUserId: string) {
  const existing = await getCountsDoc(ctx, clerkUserId);
  if (existing) return existing;
  const rows = await scanWatchlist(ctx, clerkUserId);
  const counts = new Map<string, number>();
  let unsorted = 0;
  for (const row of rows) {
    if (row.folder) counts.set(row.folder, (counts.get(row.folder) ?? 0) + 1);
    else unsorted += 1;
  }
  const _id = await ctx.db.insert("watchlistCounts", {
    clerkUserId,
    total: rows.length,
    unsorted,
    folderCounts: Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  });
  return (await ctx.db.get(_id))!;
}

async function addContentId(
  ctx: MutationCtx,
  clerkUserId: string,
  idsDoc: { _id: Id<"watchlistIds">; contentIds: string[] },
  contentId: string
) {
  await ctx.db.patch(idsDoc._id, { contentIds: [...idsDoc.contentIds, contentId] });
  const countsDoc = await ensureCountsDoc(ctx, clerkUserId);
  await ctx.db.patch(countsDoc._id, {
    total: countsDoc.total + 1,
    unsorted: countsDoc.unsorted + 1
  });
}

async function removeContentIds(
  ctx: MutationCtx,
  clerkUserId: string,
  idsDoc: { _id: Id<"watchlistIds">; contentIds: string[] },
  removed: Array<{ contentId: string; folder?: string }>
) {
  if (removed.length === 0) return;
  const removedSet = new Set(removed.map((row) => row.contentId));
  await ctx.db.patch(idsDoc._id, {
    contentIds: idsDoc.contentIds.filter((id) => !removedSet.has(id))
  });

  const countsDoc = await ensureCountsDoc(ctx, clerkUserId);
  const fromCounts = new Map<string | undefined, number>();
  for (const row of removed) fromCounts.set(row.folder, (fromCounts.get(row.folder) ?? 0) + 1);
  let folderCounts = countsDoc.folderCounts;
  let unsorted = countsDoc.unsorted;
  for (const [folder, count] of fromCounts) {
    if (folder) {
      folderCounts = folderCounts
        .map((f) => (f.name === folder ? { ...f, count: f.count - count } : f))
        .filter((f) => f.count > 0);
    } else {
      unsorted = Math.max(0, unsorted - count);
    }
  }
  await ctx.db.patch(countsDoc._id, {
    total: Math.max(0, countsDoc.total - removed.length),
    unsorted,
    folderCounts
  });
}

async function moveFolderCounts(
  ctx: MutationCtx,
  clerkUserId: string,
  fromFolder: string | undefined,
  toFolder: string | undefined,
  count: number
) {
  if (count === 0 || fromFolder === toFolder) return;
  const countsDoc = await ensureCountsDoc(ctx, clerkUserId);
  let folderCounts = countsDoc.folderCounts;
  let unsorted = countsDoc.unsorted;
  if (fromFolder) {
    folderCounts = folderCounts
      .map((f) => (f.name === fromFolder ? { ...f, count: f.count - count } : f))
      .filter((f) => f.count > 0);
  } else {
    unsorted = Math.max(0, unsorted - count);
  }
  if (toFolder) {
    const hasTarget = folderCounts.some((f) => f.name === toFolder);
    folderCounts = hasTarget
      ? folderCounts.map((f) => (f.name === toFolder ? { ...f, count: f.count + count } : f))
      : [...folderCounts, { name: toFolder, count }];
  } else {
    unsorted += count;
  }
  await ctx.db.patch(countsDoc._id, { folderCounts, unsorted });
}

async function renameFolderInCounts(
  ctx: MutationCtx,
  clerkUserId: string,
  source: string,
  target: string,
  fallbackCount: number
) {
  const countsDoc = await ensureCountsDoc(ctx, clerkUserId);
  const sourceEntry = countsDoc.folderCounts.find((f) => f.name === source);
  const count = sourceEntry?.count ?? fallbackCount;
  let folderCounts = countsDoc.folderCounts.filter((f) => f.name !== source);
  const targetEntry = folderCounts.find((f) => f.name === target);
  folderCounts = targetEntry
    ? folderCounts.map((f) => (f.name === target ? { ...f, count: f.count + count } : f))
    : [...folderCounts, { name: target, count }];
  await ctx.db.patch(countsDoc._id, { folderCounts });
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
    const idsDoc = await getIdsDoc(ctx, clerkUserId);
    if (idsDoc) return idsDoc.contentIds;
    const rows = await entriesForFolder(ctx, clerkUserId, undefined).collect();
    return rows.map((row) => row.contentId);
  }
});

export const listRecommendationSeeds = query({
  args: { clerkUserId: v.string(), folder: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { clerkUserId, folder, limit = 45 }) => {
    const fetchLimit = Math.max(1, Math.min(100, limit));
    const rows = await entriesForFolder(ctx, clerkUserId, folder).take(fetchLimit);
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
  handler: async (ctx, { clerkUserId }) => {
    const countsDoc = await getCountsDoc(ctx, clerkUserId);
    if (countsDoc) {
      return countsDoc.folderCounts.map((folder) => folder.name).sort((a, b) => a.localeCompare(b));
    }
    return (await aggregateFolderSummary(ctx, clerkUserId)).folders.map((folder) => folder.name);
  }
});

export const listWatchlistSummary = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const countsDoc = await getCountsDoc(ctx, clerkUserId);
    if (countsDoc) {
      return {
        total: countsDoc.total,
        unsorted: countsDoc.unsorted,
        folders: [...countsDoc.folderCounts].sort((a, b) => a.name.localeCompare(b.name))
      };
    }
    return aggregateFolderSummary(ctx, clerkUserId);
  }
});

export const deleteFolder = mutation({
  args: { clerkUserId: v.string(), name: folderNameValidator },
  handler: async (ctx, { clerkUserId, name }) => {
    const normalizedName = normalizeFolderName(name);
    const rows = await entriesForFolder(ctx, clerkUserId, normalizedName).collect();
    await Promise.all(rows.map((row) => ctx.db.patch(row._id, { folder: undefined })));
    await moveFolderCounts(ctx, clerkUserId, normalizedName, undefined, rows.length);
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
    await renameFolderInCounts(ctx, clerkUserId, source, target, rows.length);
  }
});

export const removeWatchlistEntries = mutation({
  args: { clerkUserId: v.string(), contentIds: v.array(v.string()) },
  handler: async (ctx, { clerkUserId, contentIds }) => {
    const uniqueIds = Array.from(new Set(contentIds));
    const rows = await Promise.all(uniqueIds.map((id) => locateEntry(ctx, clerkUserId, id)));
    const validRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    await Promise.all(validRows.map((row) => ctx.db.delete(row._id)));
    if (validRows.length === 0) return;
    const idsDoc = await ensureIdsDoc(ctx, clerkUserId);
    await removeContentIds(
      ctx,
      clerkUserId,
      idsDoc,
      validRows.map((row) => ({ contentId: row.contentId, folder: row.folder }))
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
    const validRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    await Promise.all(validRows.map((row) => ctx.db.patch(row._id, { folder: normalized })));

    const fromCounts = new Map<string | undefined, number>();
    for (const row of validRows) fromCounts.set(row.folder, (fromCounts.get(row.folder) ?? 0) + 1);
    for (const [fromFolder, count] of fromCounts) {
      await moveFolderCounts(ctx, clerkUserId, fromFolder, normalized, count);
    }
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
    const idsDoc = await ensureIdsDoc(ctx, args.clerkUserId);
    const alreadyIn = idsDoc.contentIds.includes(args.contentId);

    if (!args.inWatchlist) {
      if (!alreadyIn) return;
      const entry = await locateEntry(ctx, args.clerkUserId, args.contentId);
      if (entry) await ctx.db.delete(entry._id);
      await removeContentIds(ctx, args.clerkUserId, idsDoc, [
        { contentId: args.contentId, folder: entry?.folder }
      ]);
      return;
    }
    if (alreadyIn) return;

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
    await ctx.db.insert("watchlist", {
      clerkUserId: args.clerkUserId,
      contentId: args.contentId,
      addedAt: Date.now()
    });
    await addContentId(ctx, args.clerkUserId, idsDoc, args.contentId);
  }
});

export const setWatchlistFolder = mutation({
  args: { clerkUserId: v.string(), contentId: v.string(), folder: v.optional(folderNameValidator) },
  handler: async (ctx, { clerkUserId, contentId, folder }) => {
    const entry = await locateEntry(ctx, clerkUserId, contentId);
    if (!entry) throw new Error("Watchlist item not found");
    const normalized = folder ? normalizeFolderName(folder) : undefined;
    await ctx.db.patch(entry._id, { folder: normalized });
    await moveFolderCounts(ctx, clerkUserId, entry.folder, normalized, 1);
  }
});
