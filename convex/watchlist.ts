import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

async function getUserByClerkIdQuery(
  ctx: QueryCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  let user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const allUsers = await ctx.db.query("users").collect();
  const legacyUser = allUsers.find(
    (u) => u.clerkUserId.endsWith(`|${clerkUserId}`) || u.clerkUserId === clerkUserId
  );

  return legacyUser?._id ?? null;
}

async function getUserByClerkId(
  ctx: MutationCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  let user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const allUsers = await ctx.db.query("users").collect();
  const legacyUser = allUsers.find(
    (u) => u.clerkUserId.endsWith(`|${clerkUserId}`) || u.clerkUserId === clerkUserId
  );

  if (legacyUser) {
    await ctx.db.patch(legacyUser._id, { clerkUserId });
    return legacyUser._id;
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId,
    email: undefined,
    name: undefined,
    createdAt: Date.now()
  });
  return userId;
}

export const getMyWatchlist = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<Doc<"content">[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const contentItems: Doc<"content">[] = [];
    for (const item of watchlistItems) {
      const content = await ctx.db.get(item.contentId);
      if (content) contentItems.push(content);
    }
    return contentItems;
  }
});

export const isInWatchlist = query({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    return !!existing;
  }
});

export const getAllWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<string[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return watchlistItems.map((item) => item.contentId);
  }
});

export const areInWatchlist = query({
  args: { clerkUserId: v.string(), contentIds: v.array(v.id("content")) },
  handler: async (ctx, { clerkUserId, contentIds }): Promise<string[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const inWatchlist: string[] = [];
    for (const contentId of contentIds) {
      const existing = await ctx.db
        .query("watchlist")
        .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
        .first();
      if (existing) inWatchlist.push(contentId);
    }
    return inWatchlist;
  }
});

export const add = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) return true;

    await ctx.db.insert("watchlist", { userId, contentId, addedAt: Date.now() });
    return true;
  }
});

export const remove = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  }
});
