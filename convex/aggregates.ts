import { TableAggregate } from "@convex-dev/aggregate";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { components } from "./_generated/api";
import { mutation as rawMutation, query } from "./_generated/server";
import type { DataModel, Doc } from "./_generated/dataModel";

export const foldersByUser = new TableAggregate<{
  Namespace: string;
  Key: string;
  DataModel: DataModel;
  TableName: "watchlist";
}>(components.watchlistFolderCounts, {
  namespace: (row: Doc<"watchlist">) => row.clerkUserId,
  sortKey: (row: Doc<"watchlist">) => row.folder ?? ""
});

const triggers = new Triggers<DataModel>();
triggers.register("watchlist", foldersByUser.idempotentTrigger({ async: true }));

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export { query };
