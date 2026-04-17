import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

async function getUserByClerkId(
  ctx: any,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  let user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q: any) =>
      q.eq("clerkUserId", clerkUserId)
    )
    .first();

  if (!user) {
    const userId = await ctx.db.insert("users", {
      clerkUserId: clerkUserId,
      email: undefined,
      name: undefined,
      createdAt: Date.now()
    });
    return userId;
  }

  return user._id;
}

export const getMyWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<Array<Doc<"content"> & { progress: number; completed: boolean; watchedAt: number }>> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    const result: Array<Doc<"content"> & { progress: number; completed: boolean; watchedAt: number }> = [];
    for (const item of historyItems) {
      const content = await ctx.db.get(item.contentId);
      if (content) {
        result.push({
          ...content,
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
        });
      }
    }
    return result;
  },
});

export const getContinueWatching = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<Array<Doc<"content"> & { progress: number }>> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("completed"), false))
      .order("desc")
      .take(10);

    const result: Array<Doc<"content"> & { progress: number }> = [];
    for (const item of historyItems) {
      const content = await ctx.db.get(item.contentId);
      if (content) {
        result.push({
          ...content,
          progress: item.progress,
        });
      }
    }
    return result;
  },
});

export const getWatchProgress = query({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<number> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return 0;

    const historyItem = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) =>
        q.eq("userId", userId).eq("contentId", contentId)
      )
      .first();

    return historyItem?.progress || 0;
  },
});

export const updateProgress = mutation({
  args: { 
    clerkUserId: v.string(), 
    contentId: v.id("content"),
    progress: v.number(),
    completed: v.optional(v.boolean())
  },
  handler: async (ctx, { clerkUserId, contentId, progress, completed }): Promise<void> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) =>
        q.eq("userId", userId).eq("contentId", contentId)
      )
      .first();

    const isCompleted = completed ?? (progress >= 95);

    if (existing) {
      await ctx.db.patch(existing._id, {
        progress,
        completed: isCompleted,
        watchedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("watchHistory", {
        userId,
        contentId,
        progress,
        completed: isCompleted,
        watchedAt: Date.now(),
      });
    }
  },
});

export const markAsCompleted = mutation({
  args: { 
    clerkUserId: v.string(), 
    contentId: v.id("content")
  },
  handler: async (ctx, { clerkUserId, contentId }): Promise<void> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) =>
        q.eq("userId", userId).eq("contentId", contentId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        progress: 100,
        completed: true,
        watchedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("watchHistory", {
        userId,
        contentId,
        progress: 100,
        completed: true,
        watchedAt: Date.now(),
      });
    }
  },
});

export const removeFromHistory = mutation({
  args: { 
    clerkUserId: v.string(), 
    contentId: v.id("content")
  },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) =>
        q.eq("userId", userId).eq("contentId", contentId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});
