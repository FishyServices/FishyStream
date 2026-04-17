import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_clerk_user_id", ["clerkUserId"]),

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_user_id", ["userId"])
});
