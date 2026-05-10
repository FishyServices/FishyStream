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

function scoreAniListCandidate(media: AniListSearchMedia, title: string, season: number) {
  const baseTitle = normalizeAniListText(title);
  const ordinal = getSeasonOrdinal(season);
  const seasonTokens =
    season <= 1
      ? ["1st season", "first season", "season 1"]
      : [
          `${ordinal} season`,
          `season ${season}`,
          `${season} season`,
          `${ordinal}`,
          `part ${season}`
        ];
  const antiSeasonTokens =
    season <= 1
      ? ["2nd season", "3rd season", "4th season", "season 2", "season 3", "season 4"]
      : [];
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

    if (seasonTokens.some((token) => candidate.includes(token))) score += 10;
    if (antiSeasonTokens.some((token) => candidate.includes(token))) score -= 8;
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
