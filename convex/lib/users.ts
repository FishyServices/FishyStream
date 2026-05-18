import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

function isLegacyClerkUserIdMatch(storedValue: string, clerkUserId: string) {
  return storedValue === clerkUserId || storedValue.endsWith(`|${clerkUserId}`);
}

export async function findUserIdByClerkIdQuery(
  ctx: QueryCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const legacyUsers = await ctx.db.query("users").take(500);
  const legacyUser = legacyUsers.find((candidate) =>
    isLegacyClerkUserIdMatch(candidate.clerkUserId, clerkUserId)
  );

  return legacyUser?._id ?? null;
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

  const legacyUsers = await ctx.db.query("users").take(500);
  const legacyUser = legacyUsers.find((candidate) =>
    isLegacyClerkUserIdMatch(candidate.clerkUserId, clerkUserId)
  );

  if (legacyUser) {
    await ctx.db.patch(legacyUser._id, { clerkUserId });
    return legacyUser._id;
  }

  return ctx.db.insert("users", {
    clerkUserId,
    email: undefined,
    name: undefined,
    watchlistContentIds: [],
    createdAt: Date.now()
  });
}
