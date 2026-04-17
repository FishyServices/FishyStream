import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Query to get featured content
export const getFeatured = query({
  handler: async (ctx): Promise<Doc<"content"> | null> => {
    const featured = await ctx.db
      .query("content")
      .withIndex("by_featured", (q) => q.eq("featured", true))
      .first();
    return featured;
  },
});

// Query to get trending content
export const getTrending = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_trending", (q) => q.eq("trending", true))
      .take(20);
  },
});

// Query to get popular content
export const getPopular = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_popular", (q) => q.eq("popular", true))
      .take(20);
  },
});

// Query to get new releases
export const getNewReleases = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_new", (q) => q.eq("new", true))
      .take(20);
  },
});

// Query to get all movies
export const getMovies = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "movie"))
      .take(50);
  },
});

// Query to get all TV shows
export const getTVShows = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "tv"))
      .take(50);
  },
});

// Query to get content by ID
export const getById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<Doc<"content"> | null> => {
    return await ctx.db.get(id);
  },
});

// Query to search content
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<Doc<"content">[]> => {
    const allContent = await ctx.db.query("content").take(100);
    const lowerQuery = query.toLowerCase();
    return allContent.filter(
      (c) =>
        c.title.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery) ||
        c.genre.some((g) => g.toLowerCase().includes(lowerQuery))
    );
  },
});

// Query to get content by genre
export const getByGenre = query({
  args: { genre: v.string() },
  handler: async (ctx, { genre }): Promise<Doc<"content">[]> => {
    const allContent = await ctx.db.query("content").take(100);
    return allContent.filter((c) =>
      c.genre.some((g) => g.toLowerCase() === genre.toLowerCase())
    );
  },
});

// Mutation to create content
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    genre: v.array(v.string()),
    year: v.number(),
    rating: v.string(),
    duration: v.optional(v.string()),
    seasons: v.optional(v.number()),
    posterUrl: v.string(),
    backdropUrl: v.string(),
    vidkingUrl: v.optional(v.string()),
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string()),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    new: v.boolean(),
  },
  handler: async (ctx, args): Promise<Doc<"content">["_id"]> => {
    const now = Date.now();
    return await ctx.db.insert("content", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation to update content
export const update = mutation({
  args: {
    id: v.id("content"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    genre: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    rating: v.optional(v.string()),
    duration: v.optional(v.string()),
    seasons: v.optional(v.number()),
    posterUrl: v.optional(v.string()),
    backdropUrl: v.optional(v.string()),
    vidkingUrl: v.optional(v.string()),
    trending: v.optional(v.boolean()),
    popular: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    new: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to delete content
export const remove = mutation({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<void> => {
    await ctx.db.delete(id);
  },
});

// Internal mutation to seed initial content
export const seed = internalMutation({
  handler: async (ctx): Promise<void> => {
    const existing = await ctx.db.query("content").first();
    if (existing) {
      return;
    }

    const now = Date.now();
    const initialContent = [
      {
        title: "The Dark Horizon",
        description: "In a future where humanity has colonized Mars, a detective uncovers a conspiracy that threatens the fragile peace between Earth and the red planet.",
        type: "movie" as const,
        genre: ["Sci-Fi", "Thriller"],
        year: 2024,
        rating: "PG-13",
        duration: "2h 15m",
        posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/1",
        imdbId: "tt1234567",
        trending: true,
        popular: true,
        featured: true,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Midnight in Paris",
        description: "A romantic comedy about a writer who finds himself transported back to the 1920s every night at midnight.",
        type: "movie" as const,
        genre: ["Romance", "Comedy"],
        year: 2023,
        rating: "PG",
        duration: "1h 45m",
        posterUrl: "https://images.unsplash.com/photo-1493514789931-586cb221d7a7?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/2",
        imdbId: "tt2345678",
        trending: false,
        popular: true,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "The Last Samurai",
        description: "An American military advisor embraces the Samurai culture he was hired to destroy.",
        type: "movie" as const,
        genre: ["Action", "Drama"],
        year: 2023,
        rating: "R",
        duration: "2h 34m",
        posterUrl: "https://images.unsplash.com/photo-1541963463532-d682b7f4555b?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1528360983277-13d9012356ee?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/3",
        imdbId: "tt3456789",
        trending: false,
        popular: true,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Ocean's Echo",
        description: "Deep sea explorers discover an ancient civilization that has been hiding in the Mariana Trench for millennia.",
        type: "movie" as const,
        genre: ["Adventure", "Sci-Fi"],
        year: 2024,
        rating: "PG-13",
        duration: "2h 8m",
        posterUrl: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1551244072-5d12893278ab?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/4",
        imdbId: "tt4567890",
        trending: true,
        popular: false,
        featured: false,
        new: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Shadow Games",
        description: "A chess prodigy becomes entangled in an international espionage ring using the game as cover for their operations.",
        type: "movie" as const,
        genre: ["Thriller", "Mystery"],
        year: 2024,
        rating: "R",
        duration: "2h 5m",
        posterUrl: "https://images.unsplash.com/photo-1586165368502-1bad197a6461?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1523875194681-bedd468c58bf?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/5",
        imdbId: "tt5678901",
        trending: false,
        popular: true,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Neon Nights",
        description: "A street racer in a cyberpunk future must win the ultimate race to save his family from a corrupt corporation.",
        type: "movie" as const,
        genre: ["Action", "Sci-Fi"],
        year: 2024,
        rating: "PG-13",
        duration: "1h 58m",
        posterUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1515630278258-407f66498911?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/6",
        imdbId: "tt6789012",
        trending: true,
        popular: false,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "The Garden Keeper",
        description: "An elderly gardener discovers a magical portal in her greenhouse that leads to parallel worlds.",
        type: "movie" as const,
        genre: ["Fantasy", "Drama"],
        year: 2023,
        rating: "PG",
        duration: "1h 52m",
        posterUrl: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/7",
        imdbId: "tt7890123",
        trending: false,
        popular: false,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Velocity",
        description: "An F1 driver seeks redemption after a career-threatening crash.",
        type: "movie" as const,
        genre: ["Sports", "Drama"],
        year: 2024,
        rating: "PG-13",
        duration: "2h 10m",
        posterUrl: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1532906610278-77c7c86eaf92?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/movie/8",
        imdbId: "tt8901234",
        trending: false,
        popular: false,
        featured: false,
        new: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Crown of Shadows",
        description: "A political drama about a royal family torn apart by secrets, betrayal, and the fight for the throne.",
        type: "tv" as const,
        genre: ["Drama", "Political"],
        year: 2024,
        rating: "TV-MA",
        seasons: 3,
        posterUrl: "https://images.unsplash.com/photo-1595769816263-9b910be24d5f?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/tv/1",
        imdbId: "tt9012345",
        trending: true,
        popular: true,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Tech Noir",
        description: "In a near-future where AI controls everything, a group of hackers fights to reclaim humanity's freedom.",
        type: "tv" as const,
        genre: ["Sci-Fi", "Thriller"],
        year: 2024,
        rating: "TV-14",
        seasons: 2,
        posterUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/tv/2",
        imdbId: "tt0123456",
        trending: true,
        popular: false,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "The Culinary Wars",
        description: "Elite chefs compete in a high-stakes cooking competition where one mistake means elimination.",
        type: "tv" as const,
        genre: ["Reality", "Competition"],
        year: 2023,
        rating: "TV-PG",
        seasons: 5,
        posterUrl: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/tv/3",
        imdbId: "tt1122334",
        trending: false,
        popular: true,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Mystery Peak",
        description: "A detective returns to her hometown to solve a series of supernatural murders.",
        type: "tv" as const,
        genre: ["Mystery", "Supernatural"],
        year: 2024,
        rating: "TV-14",
        seasons: 1,
        posterUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/tv/4",
        imdbId: "tt2233445",
        trending: false,
        popular: false,
        featured: false,
        new: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Laugh Track",
        description: "Behind the scenes of a struggling sitcom trying to find its footing in the streaming age.",
        type: "tv" as const,
        genre: ["Comedy", "Drama"],
        year: 2023,
        rating: "TV-14",
        seasons: 2,
        posterUrl: "https://images.unsplash.com/photo-1516280440614-6697288d5d38?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/tv/5",
        imdbId: "tt3344556",
        trending: false,
        popular: false,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: "Wilderness",
        description: "Survival experts test their skills in the world's most extreme environments.",
        type: "tv" as const,
        genre: ["Documentary", "Adventure"],
        year: 2024,
        rating: "TV-PG",
        seasons: 4,
        posterUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=750&fit=crop",
        backdropUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&h=1080&fit=crop",
        vidkingUrl: "https://www.vidking.net/embed/tv/6",
        imdbId: "tt4455667",
        trending: false,
        popular: true,
        featured: false,
        new: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const item of initialContent) {
      await ctx.db.insert("content", item);
    }
  },
});
