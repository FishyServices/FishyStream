import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const syncCurrentUser = mutation({
  handler: async (ctx): Promise<Id<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.log("No identity found");
      return null;
    }

    console.log("Identity found:", identity.tokenIdentifier);

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) =>
        q.eq("clerkUserId", identity.tokenIdentifier)
      )
      .unique();

    if (user) {
      console.log("Existing user found:", user._id);
      return user._id;
    }

    console.log("Creating new user");
    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.tokenIdentifier,
      email: identity.email,
      name: identity.name,
      createdAt: Date.now()
    });

    console.log("New user created:", userId);
    return userId;
  }
});

export const getCurrentUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", args.clerkUserId))
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
      .withIndex("by_clerk_user_id", (q: any) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("users", {
      ...args,
      createdAt: Date.now()
    });
  }
});
