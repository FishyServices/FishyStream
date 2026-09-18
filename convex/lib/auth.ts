import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { query, mutation } from "../_generated/server";

const withViewer = customCtx(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");

  return { viewerId: identity.subject };
});

export const viewerQuery = customQuery(query, withViewer);
export const viewerMutation = customMutation(mutation, withViewer);
