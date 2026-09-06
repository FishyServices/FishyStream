import { useCallback, useEffect, useMemo, useState } from "react";

export type RecommendationFolderScope = {
  folder: string | null;
};

const DEFAULT_SCOPE: RecommendationFolderScope = { folder: null };
const scopeKey = (userId: string) => `fishystream:recommendation-folder-scope:${userId}`;
const SCOPE_CHANGED_EVENT = "fishystream:recommendation-folder-scope-changed";

function normalizeScope(value: unknown): RecommendationFolderScope {
  if (!value || typeof value !== "object") return DEFAULT_SCOPE;
  const candidate = value as Partial<RecommendationFolderScope>;
  return {
    folder:
      typeof candidate.folder === "string" && candidate.folder.trim()
        ? candidate.folder.trim()
        : null
  };
}

export function getRecommendationFolderScope(userId = "guest"): RecommendationFolderScope {
  try {
    return normalizeScope(JSON.parse(localStorage.getItem(scopeKey(userId)) ?? "null"));
  } catch {
    return DEFAULT_SCOPE;
  }
}

export function setRecommendationFolderScope(userId: string, scope: RecommendationFolderScope) {
  const normalized = normalizeScope(scope);
  try {
    localStorage.setItem(scopeKey(userId), JSON.stringify(normalized));
    window.dispatchEvent(
      new CustomEvent(SCOPE_CHANGED_EVENT, { detail: { userId, scope: normalized } })
    );
  } catch {}
}

export function useRecommendationFolderScope(userId = "guest") {
  const [scope, setScope] = useState<RecommendationFolderScope>(() =>
    getRecommendationFolderScope(userId)
  );

  useEffect(() => {
    setScope(getRecommendationFolderScope(userId));

    const onScopeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; scope?: RecommendationFolderScope }>)
        .detail;
      if (detail?.userId === userId && detail.scope) setScope(normalizeScope(detail.scope));
    };
    window.addEventListener(SCOPE_CHANGED_EVENT, onScopeChanged);
    return () => window.removeEventListener(SCOPE_CHANGED_EVENT, onScopeChanged);
  }, [userId]);

  const saveScope = useCallback(
    (nextScope: RecommendationFolderScope) => {
      const normalized = normalizeScope(nextScope);
      setScope(normalized);
      setRecommendationFolderScope(userId, normalized);
    },
    [userId]
  );

  return useMemo(() => ({ scope, setScope: saveScope }), [scope, saveScope]);
}
