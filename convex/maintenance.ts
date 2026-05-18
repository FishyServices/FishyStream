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
    const [watchlistUpdated, watchHistoryUpdated] = await Promise.all([
      ctx.runMutation(internal.watchlist.compactWatchlistSnapshots, { limit: watchlistLimit }),
      ctx.runMutation(internal.watchHistory.compactWatchHistorySnapshots, {
        limit: watchHistoryLimit
      })
    ]);

    return { watchlistUpdated, watchHistoryUpdated };
  }
});

export const rebuildSeasonAggregates = action({
  args: {
    contentId: v.optional(v.id("content")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<number> => {
    return await ctx.runMutation(internal.seasons.rebuildContentSeasonAggregates, args);
  }
});

export const rebuildContentCardCache = action({
  args: {
    contentId: v.optional(v.id("content")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<number> => {
    return await ctx.runMutation(internal.content.rebuildContentCards, args);
  }
});

export const runAllMaintenance = action({
  args: {
    watchlistLimit: v.optional(v.number()),
    watchHistoryLimit: v.optional(v.number()),
    seasonLimit: v.optional(v.number()),
    contentCardLimit: v.optional(v.number())
  },
  handler: async (
    ctx,
    { watchlistLimit = 5000, watchHistoryLimit = 5000, seasonLimit = 500, contentCardLimit = 1000 }
  ): Promise<{
    watchlistUpdated: number;
    watchHistoryUpdated: number;
    seasonAggregatesUpdated: number;
    contentCardsUpdated: number;
  }> => {
    const [snapshots, seasonAggregates, contentCardsUpdated]: [[number, number], number, number] = await Promise.all([
      Promise.all([
        ctx.runMutation(internal.watchlist.compactWatchlistSnapshots, { limit: watchlistLimit }),
        ctx.runMutation(internal.watchHistory.compactWatchHistorySnapshots, {
          limit: watchHistoryLimit
        })
      ]),
      ctx.runMutation(internal.seasons.rebuildContentSeasonAggregates, { limit: seasonLimit }),
      ctx.runMutation(internal.content.rebuildContentCards, { limit: contentCardLimit })
    ]);

    return {
      watchlistUpdated: snapshots[0],
      watchHistoryUpdated: snapshots[1],
      seasonAggregatesUpdated: seasonAggregates,
      contentCardsUpdated
    };
  }
});
