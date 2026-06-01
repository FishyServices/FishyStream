import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const ensureCurrentUser = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string())
  },
  handler: async (ctx, { clerkUserId, email, name, avatarUrl }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .first();

    if (!user) {
      return await ctx.db.insert("users", {
        clerkUserId,
        email,
        name,
        avatarUrl,
        createdAt: Date.now()
      });
    }

    return user._id;
  }
});
