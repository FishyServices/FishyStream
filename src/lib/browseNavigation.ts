import type { SetURLSearchParams } from "react-router-dom";

export interface BrowseParamUpdates {
  sort?: string;
  genre?: string;
  page?: number;
}

export function parsePageParam(value: string | null) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function parseSortParam<TSort extends string>(
  value: string | null,
  validSorts: ReadonlySet<TSort>,
  fallback: TSort
) {
  return value && validSorts.has(value as TSort) ? (value as TSort) : fallback;
}

export function updateBrowseParams(
  setSearchParams: SetURLSearchParams,
  updates: BrowseParamUpdates
) {
  setSearchParams((params) => {
    const next = new URLSearchParams(params);

    if (updates.sort !== undefined) {
      next.set("sort", updates.sort);
    }
    if (updates.genre !== undefined) {
      if (updates.genre === "All") {
        next.delete("genre");
      } else {
        next.set("genre", updates.genre);
      }
    }
    if (updates.page !== undefined) {
      if (updates.page <= 1) {
        next.delete("page");
      } else {
        next.set("page", String(updates.page));
      }
    }

    return next;
  });
}
