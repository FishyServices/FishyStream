/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as domains_history_watchHistory from "../domains/history/watchHistory.js";
import type * as domains_progress_watchProgress from "../domains/progress/watchProgress.js";
import type * as domains_seasons_seasonSync from "../domains/seasons/seasonSync.js";
import type * as domains_seasons_seasons from "../domains/seasons/seasons.js";
import type * as domains_watchlist_watchlist from "../domains/watchlist/watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "domains/history/watchHistory": typeof domains_history_watchHistory;
  "domains/progress/watchProgress": typeof domains_progress_watchProgress;
  "domains/seasons/seasonSync": typeof domains_seasons_seasonSync;
  "domains/seasons/seasons": typeof domains_seasons_seasons;
  "domains/watchlist/watchlist": typeof domains_watchlist_watchlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
