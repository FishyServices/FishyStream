export function selectFreshRecommendations<T>(
  candidates: T[],
  limit: number,
  recentKeys: readonly string[],
  getKey: (candidate: T) => string
): { items: T[]; recentKeys: string[] } {
  const unique = new Map<string, T>();
  for (const candidate of candidates) unique.set(getKey(candidate), candidate);

  const entries = [...unique.entries()];
  const previousPage = recentKeys.slice(0, Math.max(0, limit));
  const lastPreviousKey = [...previousPage]
    .reverse()
    .find((key) => entries.some(([entryKey]) => entryKey === key));
  const lastIndex = entries.findIndex(([key]) => key === lastPreviousKey);
  const start = lastIndex < 0 ? 0 : (lastIndex + 1) % Math.max(1, entries.length);
  const rotated = [...entries.slice(start), ...entries.slice(0, start)];
  const selected = rotated.slice(0, Math.max(0, limit));

  const shownKeys = selected.map(([key]) => key);
  return {
    items: selected.map(([, candidate]) => candidate),
    recentKeys: [...new Set([...shownKeys, ...recentKeys])].slice(0, 512)
  };
}
