export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  let state = seed >>> 0 || 0x9e3779b9;

  const nextRandom = () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return shuffled
    .map((item) => ({ item, order: nextRandom() }))
    .sort((left, right) => left.order - right.order)
    .map(({ item }) => item);
}

export function selectFreshRecommendations<T>(
  candidates: readonly T[],
  limit: number,
  recentKeys: readonly string[],
  getKey: (candidate: T) => string,
  seed = 0
): { items: T[]; recentKeys: string[] } {
  const unique = new Map<string, T>();
  for (const candidate of candidates) unique.set(getKey(candidate), candidate);

  const entries = [...unique.entries()];
  const safeLimit = Math.max(0, limit);
  if (safeLimit === 0 || entries.length === 0) return { items: [], recentKeys: [] };

  const availableKeys = new Set(unique.keys());
  const seen = new Set(recentKeys.filter((key) => availableKeys.has(key)));
  const fresh = entries.filter(([key]) => !seen.has(key));
  const startsNewCycle = fresh.length < safeLimit;
  const pool = startsNewCycle ? [...fresh, ...entries.filter(([key]) => seen.has(key))] : fresh;
  const selected = shuffleWithSeed(pool, seed).slice(0, safeLimit);
  const selectedKeys = selected.map(([key]) => key);

  return {
    items: selected.map(([, item]) => item),
    recentKeys: startsNewCycle
      ? selectedKeys
      : [...new Set([...selectedKeys, ...recentKeys])].slice(0, 512)
  };
}
