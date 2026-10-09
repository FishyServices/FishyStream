import type { AniListMedia } from "./types.js";

export const MATCH_THRESHOLD = 30;

const SEASON_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;
const ROMAN_SEASONS: Readonly<Record<string, number>> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const ORDINAL_SUFFIXES: Readonly<Record<number, string>> = { 1: "st", 2: "nd", 3: "rd" };
const GENERIC_SEASON_TITLES = [
  /^season \d+$/,
  /^\d+(?:st|nd|rd|th) season$/,
  /^part \d+$/,
  /^cour \d+$/
] as const;
const SEASON_NUMBER_PATTERNS = [/\bseason\s+(\d+)\b/g, /\b(\d+)(?:st|nd|rd|th)\s+season\b/g];
const PART_PATTERNS = [/\bpart\s+(\d+)\b/g];
const COUR_PATTERNS = [/\bcour\s+(\d+)\b/g];
const NON_SERIES_PATTERN = /\b(?:specials?|ova|oad|movie)\b/;
const MIN_TOKEN_LENGTH = 3;
const MIN_TOKEN_OVERLAP = 0.5;

interface SeasonSignals {
  explicit: Set<number>;
  parts: Set<number>;
  cours: Set<number>;
}

interface VariantScore {
  score: number;
  matchedBase: boolean;
  overlap: number;
}

export function normalizeTitle(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(text.split(" ").filter((token) => token.length >= MIN_TOKEN_LENGTH));
}

function toOrdinal(season: number): string {
  const lastTwoDigits = season % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${season}th`;
  return `${season}${ORDINAL_SUFFIXES[season % 10] ?? "th"}`;
}

export function buildSearchCandidates(
  title: string,
  season: number,
  seasonTitle?: string
): string[] {
  const base = title.trim();
  const named = seasonTitle?.trim();
  const normalizedNamed = normalizeTitle(named);
  const isGeneric =
    !normalizedNamed || GENERIC_SEASON_TITLES.some((pattern) => pattern.test(normalizedNamed));
  const candidates = new Set<string>();

  if (named && normalizedNamed !== "season") {
    candidates.add(`${base} ${named}`);
    if (!isGeneric) candidates.add(named);
  }
  candidates.add(base);

  if (season > 1) {
    const ordinal = toOrdinal(season);
    candidates.add(`${base} ${ordinal} season`);
    candidates.add(`${base} season ${season}`);
    candidates.add(`${base} ${season} season`);
    candidates.add(`${base} ${ordinal}`);
    candidates.add(`${base} ${season}`);
  }

  return [...candidates].filter(Boolean);
}

function collectNumbers(text: string, patterns: readonly RegExp[]): Set<number> {
  const values = new Set<number>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) values.add(value);
    }
  }
  return values;
}

function readSeasonSignals(variant: string): SeasonSignals {
  const explicit = collectNumbers(variant, SEASON_NUMBER_PATTERNS);
  SEASON_WORDS.forEach((word, index) => {
    if (variant.includes(`${word} season`)) explicit.add(index + 1);
  });
  return {
    explicit,
    parts: collectNumbers(variant, PART_PATTERNS),
    cours: collectNumbers(variant, COUR_PATTERNS)
  };
}

function readRomanSeason(variant: string, base: string): number | undefined {
  if (!variant.startsWith(base)) return undefined;
  const token = variant
    .slice(base.length)
    .trim()
    .match(/^(ii|iii|iv|v|vi)\b/)?.[1];
  return token ? ROMAN_SEASONS[token] : undefined;
}

function readNumericSeason(variant: string, base: string): number | undefined {
  if (!variant.startsWith(`${base} `)) return undefined;
  const digits = variant
    .slice(base.length)
    .trim()
    .match(/^(\d+)(?:\b|$)/)?.[1];
  const season = Number(digits);
  return digits && Number.isSafeInteger(season) && season > 0 ? season : undefined;
}

function mediaTitles(media: AniListMedia): string[] {
  return [media.title?.romaji, media.title?.english, media.title?.native, ...(media.synonyms ?? [])]
    .map(normalizeTitle)
    .filter(Boolean);
}

function formatScore(format?: string | null): number {
  if (format === "TV") return 12;
  return format === "ONA" ? 4 : -6;
}

function yearScore(startYear: number | null | undefined, year: number): number {
  if (!startYear) return 0;
  if (startYear === year) return 12;
  const distance = Math.abs(startYear - year);
  if (distance === 1) return 4;
  return distance > 2 ? -10 : 0;
}

function scoreVariant(
  variant: string,
  base: string,
  baseTokens: ReadonlySet<string>,
  season: number
): VariantScore {
  let score = 0;
  let matchedBase = true;

  if (variant === base) score += 12;
  else if (variant.startsWith(base)) score += 8;
  else if (variant.includes(base)) score += 5;
  else matchedBase = false;

  const variantTokens = tokenize(variant);
  const sharedTokens = [...baseTokens].filter((token) => variantTokens.has(token)).length;
  const overlap = baseTokens.size > 0 ? sharedTokens / baseTokens.size : 0;

  const signals = readSeasonSignals(variant);
  const roman = readRomanSeason(variant, base);
  const numeric = readNumericSeason(variant, base);

  const explicitMatch = signals.explicit.has(season);
  const explicitMismatch = signals.explicit.size > 0 && !explicitMatch;
  const romanMatch = roman === season;
  const romanMismatch = roman !== undefined && !romanMatch;
  const numericMatch = numeric === season;
  const numericMismatch = numeric !== undefined && !numericMatch;
  const partMatch = signals.parts.has(season);
  const courMatch = signals.cours.has(season);

  if (explicitMatch) score += 14;
  if (explicitMismatch) score -= 24;
  if (romanMatch) score += 14;
  if (romanMismatch) score -= 18;
  if (numericMatch) score += 14;
  if (numericMismatch) score -= 18;
  if (signals.cours.size > 0 && !courMatch) score -= 20;
  if (signals.parts.size > 0 && !partMatch) score -= 20;

  const seasonMatch = explicitMatch || romanMatch || numericMatch;
  const hasSeasonSignal = seasonMatch || explicitMismatch || romanMismatch || numericMismatch;

  if (!hasSeasonSignal) {
    if (partMatch) score += 4;
    if (courMatch) score += 3;
  } else if (seasonMatch && (partMatch || courMatch)) {
    score -= 16;
  }

  const seasonWord = SEASON_WORDS[season - 1];
  if (seasonWord && variant.includes(`${seasonWord} season`)) score += 6;
  if (NON_SERIES_PATTERN.test(variant)) score -= 20;

  return { score, matchedBase, overlap };
}

export function scoreMedia(
  media: AniListMedia,
  title: string,
  season: number,
  year?: number
): number {
  const variants = mediaTitles(media);
  if (variants.length === 0) return -1;

  const base = normalizeTitle(title);
  const baseTokens = tokenize(base);
  let score = formatScore(media.format);
  let matchedBase = false;
  let bestOverlap = 0;

  for (const variant of variants) {
    const result = scoreVariant(variant, base, baseTokens, season);
    score += result.score;
    matchedBase ||= result.matchedBase;
    bestOverlap = Math.max(bestOverlap, result.overlap);
  }

  if (!matchedBase && bestOverlap < MIN_TOKEN_OVERLAP) return -1;
  if (year) score += yearScore(media.startDate?.year, year);
  return matchedBase ? score : score - 18;
}

export function hasStrongTitleMatch(media: AniListMedia, title: string, season: number): boolean {
  const base = normalizeTitle(title);
  return mediaTitles(media).some((variant) => {
    if (variant !== base && !variant.startsWith(`${base} `)) return false;
    if (season <= 1) return true;
    return (
      readSeasonSignals(variant).explicit.has(season) ||
      readRomanSeason(variant, base) === season ||
      readNumericSeason(variant, base) === season
    );
  });
}
