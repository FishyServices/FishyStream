import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function findUserIdByClerkIdQuery(
  ctx: QueryCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  return user?._id ?? null;
}

export async function findOrCreateUserIdByClerkId(
  ctx: MutationCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  return ctx.db.insert("users", {
    clerkUserId,
    email: undefined,
    name: undefined,
    createdAt: Date.now()
  });
}
