import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const syncCurrentUser = mutation({
  handler: async (ctx): Promise<Id<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkUserId = identity.subject;

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (user) return user._id;

    const userId = await ctx.db.insert("users", {
      clerkUserId,
      email: identity.email,
      name: identity.name,
      createdAt: Date.now()
    });

    return userId;
  }
});

export const getCurrentUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  }
});

export const createUser = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      ...args,
      createdAt: Date.now()
    });
  }
});
