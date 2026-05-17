import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const compactClientSnapshots = action({
  args: {
    watchlistLimit: v.optional(v.number()),
    watchHistoryLimit: v.optional(v.number())
  },
  handler: async (
    ctx,
    { watchlistLimit = 5000, watchHistoryLimit = 5000 }
  ): Promise<{ watchlistUpdated: number; watchHistoryUpdated: number }> => {
    const watchlistUpdated: number = await ctx.runMutation(
      internal.watchlist.compactWatchlistSnapshots,
      { limit: watchlistLimit }
    );
    const watchHistoryUpdated: number = await ctx.runMutation(
      internal.watchHistory.compactWatchHistorySnapshots,
      {
        limit: watchHistoryLimit
      }
    );

    return {
      watchlistUpdated,
      watchHistoryUpdated
    };
  }
});
