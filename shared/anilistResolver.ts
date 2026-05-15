interface AniListSearchMedia {
  id: number;
  format?: string | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: string[] | null;
}

function normalizeAniListText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSeasonOrdinal(season: number) {
  const mod100 = season % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${season}th`;
  const mod10 = season % 10;
  if (mod10 === 1) return `${season}st`;
  if (mod10 === 2) return `${season}nd`;
  if (mod10 === 3) return `${season}rd`;
  return `${season}th`;
}

function getSeasonWord(season: number) {
  const words: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth"
  };
  return words[season];
}

function buildAniListSearchCandidates(title: string, season: number, seasonTitle?: string) {
  const cleanedTitle = title.trim();
  const cleanedSeasonTitle = seasonTitle?.trim();
  const candidates = new Set<string>();
  const normalizedSeasonTitle = normalizeAniListText(cleanedSeasonTitle);
  const genericSeasonTitle =
    !normalizedSeasonTitle ||
    /^season \d+$/.test(normalizedSeasonTitle) ||
    /^\d+(st|nd|rd|th) season$/.test(normalizedSeasonTitle) ||
    /^part \d+$/.test(normalizedSeasonTitle) ||
    /^cour \d+$/.test(normalizedSeasonTitle);

  if (cleanedSeasonTitle && normalizedSeasonTitle !== "season") {
    candidates.add(`${cleanedTitle} ${cleanedSeasonTitle}`);
    if (!genericSeasonTitle) {
      candidates.add(cleanedSeasonTitle);
    }
  }

  candidates.add(cleanedTitle);

  if (season > 1) {
    const ordinal = getSeasonOrdinal(season);
    candidates.add(`${cleanedTitle} ${ordinal} season`);
    candidates.add(`${cleanedTitle} season ${season}`);
    candidates.add(`${cleanedTitle} ${season} season`);
    candidates.add(`${cleanedTitle} ${ordinal}`);
    candidates.add(`${cleanedTitle} ${season}`);
  }

  return [...candidates].filter(Boolean);
}

function extractTaggedSeasonNumbers(
  candidate: string,
  patterns: RegExp[],
  transform?: (value: number) => number
) {
  const values = new Set<number>();

  for (const pattern of patterns) {
    for (const match of candidate.matchAll(pattern)) {
      const value = Number(match[1]);
      if (!Number.isFinite(value) || value <= 0) continue;
      values.add(transform ? transform(value) : value);
    }
  }

  return values;
}

function getSeasonSignals(candidate: string) {
  const explicitSeasonNumbers = extractTaggedSeasonNumbers(candidate, [
    /\bseason\s+(\d+)\b/g,
    /\b(\d+)(?:st|nd|rd|th)\s+season\b/g
  ]);
  const wordMatches = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;

  wordMatches.forEach((word, index) => {
    if (candidate.includes(`${word} season`)) {
      explicitSeasonNumbers.add(index + 1);
    }
  });

  return {
    explicitSeasonNumbers,
    partNumbers: extractTaggedSeasonNumbers(candidate, [/\bpart\s+(\d+)\b/g]),
    courNumbers: extractTaggedSeasonNumbers(candidate, [/\bcour\s+(\d+)\b/g])
  };
}

function scoreAniListCandidate(media: AniListSearchMedia, title: string, season: number) {
  const baseTitle = normalizeAniListText(title);
  const titles = [
    media.title?.romaji,
    media.title?.english,
    media.title?.native,
    ...(media.synonyms ?? [])
  ]
    .map((entry) => normalizeAniListText(entry))
    .filter(Boolean);

  if (!titles.length) return -1;

  let score = 0;
  if (media.format === "TV") score += 12;
  else if (media.format === "ONA") score += 4;
  else score -= 6;
  let matchedBaseTitle = false;

  for (const candidate of titles) {
    if (candidate === baseTitle) {
      score += 12;
      matchedBaseTitle = true;
    } else if (candidate.startsWith(baseTitle)) {
      score += 8;
      matchedBaseTitle = true;
    } else if (candidate.includes(baseTitle)) {
      score += 5;
      matchedBaseTitle = true;
    }

    const { explicitSeasonNumbers, partNumbers, courNumbers } = getSeasonSignals(candidate);
    const hasExplicitSeasonMatch = explicitSeasonNumbers.has(season);
    const hasExplicitSeasonMismatch =
      explicitSeasonNumbers.size > 0 && !explicitSeasonNumbers.has(season);

    if (hasExplicitSeasonMatch) score += 14;
    if (hasExplicitSeasonMismatch) score -= 24;

    if (!hasExplicitSeasonMatch && !hasExplicitSeasonMismatch) {
      if (partNumbers.has(season)) score += 4;
      if (courNumbers.has(season)) score += 3;
    } else {
      if (partNumbers.has(season)) score += 1;
      if (courNumbers.has(season)) score += 1;
    }

    const seasonWord = getSeasonWord(season);
    if (seasonWord && candidate.includes(`${seasonWord} season`)) {
      score += 6;
    }

    if (
      candidate.includes("special") ||
      candidate.includes("specials") ||
      candidate.includes("ova") ||
      candidate.includes("oad") ||
      candidate.includes("movie")
    ) {
      score -= 20;
    }
  }

  if (!matchedBaseTitle) {
    score -= 18;
  }

  return score;
}

async function searchAniListCandidate(search: string): Promise<AniListSearchMedia[]> {
  if (!search) return [];

  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query: `
          query ($search: String) {
            Page(page: 1, perPage: 5) {
              media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                id
                format
                title {
                  romaji
                  english
                  native
                }
                synonyms
              }
            }
          }
        `,
        variables: { search }
      })
    });

    if (!response.ok) return [];

    const json = (await response.json()) as {
      data?: { Page?: { media?: AniListSearchMedia[] | null } | null };
    };

    return json.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}

async function fetchAniListYearCandidates(
  year: number,
  page: number
): Promise<AniListSearchMedia[]> {
  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query: `
          query ($seasonYear: Int, $page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              media(type: ANIME, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
                id
                format
                title {
                  romaji
                  english
                  native
                }
                synonyms
              }
            }
          }
        `,
        variables: {
          seasonYear: year,
          page,
          perPage: 50
        }
      })
    });

    if (!response.ok) return [];

    const json = (await response.json()) as {
      data?: { Page?: { media?: AniListSearchMedia[] | null } | null };
    };

    return json.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}

export async function resolveAniListId(args: {
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
}): Promise<string | null> {
  const { title, season, seasonTitle, year } = args;
  if (!title) return null;

  const searches = buildAniListSearchCandidates(title, season, seasonTitle);
  let bestMatch: AniListSearchMedia | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const search of searches) {
    const results = await searchAniListCandidate(search);

    for (const media of results) {
      const score = scoreAniListCandidate(media, title, season);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = media;
      }
    }
  }

  if (!bestMatch && year) {
    const yearCandidates = new Map<number, AniListSearchMedia>();
    for (const candidateYear of [year, year - 1, year + 1]) {
      for (const page of [1, 2]) {
        const results = await fetchAniListYearCandidates(candidateYear, page);
        for (const media of results) {
          yearCandidates.set(media.id, media);
        }
      }
    }

    for (const media of yearCandidates.values()) {
      const score = scoreAniListCandidate(media, title, season);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = media;
      }
    }
  }

  return bestMatch ? String(bestMatch.id) : null;
}
