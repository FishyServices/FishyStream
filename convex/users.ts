import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { findOrCreateUserIdByClerkId } from "./lib/users";

export const ensureCurrentUser = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string())
  },
  handler: async (ctx, { clerkUserId, email, name, avatarUrl }) => {
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
    if (!userId) return null;

    await ctx.db.patch(userId, {
      email,
      name,
      avatarUrl
    });

    return userId;
  }
});
