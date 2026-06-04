interface AniListSearchMedia {
  id: number;
  episodes?: number | null;
  type?: string | null;
  startDate?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
  } | null;
  format?: string | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: string[] | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: AniListSearchMedia | null;
    }> | null;
  } | null;
}

export interface AniListEpisodeAddress {
  anilistId: string;
  episode: number;
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

function scoreAniListCandidate(
  media: AniListSearchMedia,
  title: string,
  season: number,
  year?: number
) {
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
  let bestTitleOverlap = 0;
  const baseTitleTokens = new Set(baseTitle.split(" ").filter((token) => token.length > 2));

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

    const candidateTokens = new Set(candidate.split(" ").filter((token) => token.length > 2));
    const sharedTokenCount = [...baseTitleTokens].filter((token) =>
      candidateTokens.has(token)
    ).length;
    if (baseTitleTokens.size > 0) {
      bestTitleOverlap = Math.max(bestTitleOverlap, sharedTokenCount / baseTitleTokens.size);
    }

    const { explicitSeasonNumbers, partNumbers, courNumbers } = getSeasonSignals(candidate);
    const romanSeasonNumber = parseRomanSeasonSignal(candidate, baseTitle);
    const hasExplicitSeasonMatch = explicitSeasonNumbers.has(season);
    const hasExplicitSeasonMismatch =
      explicitSeasonNumbers.size > 0 && !explicitSeasonNumbers.has(season);
    const hasRomanSeasonMatch = romanSeasonNumber === season;
    const hasRomanSeasonMismatch = romanSeasonNumber !== undefined && romanSeasonNumber !== season;

    if (hasExplicitSeasonMatch) score += 14;
    if (hasExplicitSeasonMismatch) score -= 24;
    if (hasRomanSeasonMatch) score += 14;
    if (hasRomanSeasonMismatch) score -= 18;

    if (
      !hasExplicitSeasonMatch &&
      !hasExplicitSeasonMismatch &&
      !hasRomanSeasonMatch &&
      !hasRomanSeasonMismatch
    ) {
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

  if (!matchedBaseTitle && bestTitleOverlap < 0.5) {
    return -1;
  }

  if (year) {
    const startYear = media.startDate?.year;
    if (startYear === year) {
      score += 12;
    } else if (startYear && Math.abs(startYear - year) === 1) {
      score += 4;
    } else if (startYear && Math.abs(startYear - year) > 2) {
      score -= 10;
    }
  }

  if (!matchedBaseTitle) {
    score -= 18;
  }

  return score;
}

function parseRomanSeasonSignal(candidate: string, baseTitle: string) {
  if (!candidate.startsWith(baseTitle)) return undefined;

  const suffix = candidate.slice(baseTitle.length).trim();
  const firstToken = suffix.match(/^(ii|iii|iv|v|vi)\b/)?.[1];
  if (!firstToken) return undefined;

  const romanValues: Record<string, number> = {
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6
  };
  return romanValues[firstToken];
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
                startDate {
                  year
                  month
                  day
                }
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
                startDate {
                  year
                  month
                  day
                }
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

const aniListMediaByIdCache = new Map<string, Promise<AniListSearchMedia | null>>();

function isAniListSeriesMedia(media?: AniListSearchMedia | null) {
  if (!media || media.type !== "ANIME") return false;
  return !media.format || ["TV", "TV_SHORT", "ONA"].includes(media.format);
}

function getAniListEpisodeCount(media: AniListSearchMedia) {
  const episodes = media.episodes ?? 0;
  return Number.isFinite(episodes) && episodes > 0 ? Math.floor(episodes) : undefined;
}

function getAniListStartDateValue(media: AniListSearchMedia) {
  const year = media.startDate?.year ?? 9999;
  const month = media.startDate?.month ?? 12;
  const day = media.startDate?.day ?? 31;
  return year * 10_000 + month * 100 + day;
}

async function fetchAniListMediaById(id: string): Promise<AniListSearchMedia | null> {
  if (!id) return null;

  const cached = aniListMediaByIdCache.get(id);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          query: `
            query ($id: Int) {
              Media(id: $id, type: ANIME) {
                id
                type
                format
                episodes
                startDate {
                  year
                  month
                  day
                }
                title {
                  romaji
                  english
                  native
                }
                synonyms
                relations {
                  edges {
                    relationType
                    node {
                      id
                      type
                      format
                      episodes
                      startDate {
                        year
                        month
                        day
                      }
                      title {
                        romaji
                        english
                        native
                      }
                      synonyms
                    }
                  }
                }
              }
            }
          `,
          variables: { id: Number(id) }
        })
      });

      if (!response.ok) return null;

      const json = (await response.json()) as {
        data?: { Media?: AniListSearchMedia | null };
      };

      return json.data?.Media ?? null;
    } catch {
      return null;
    }
  })();

  aniListMediaByIdCache.set(id, pending);
  return pending;
}

async function resolveEpisodeInAniListChain(
  media: AniListSearchMedia,
  episode: number,
  visited: Set<number>
): Promise<AniListEpisodeAddress | null> {
  if (visited.has(media.id)) return null;
  visited.add(media.id);

  const ownEpisodeCount = getAniListEpisodeCount(media);
  if (ownEpisodeCount === undefined || episode <= ownEpisodeCount) {
    return { anilistId: String(media.id), episode };
  }

  let remainingEpisode = episode - ownEpisodeCount;
  const sequels = (media.relations?.edges ?? [])
    .filter((edge) => edge?.relationType === "SEQUEL" && isAniListSeriesMedia(edge.node))
    .map((edge) => edge.node!)
    .sort((a, b) => getAniListStartDateValue(a) - getAniListStartDateValue(b));

  for (const sequel of sequels) {
    const fullSequel = (await fetchAniListMediaById(String(sequel.id))) ?? sequel;
    const sequelEpisodeCount = getAniListEpisodeCount(fullSequel);

    if (sequelEpisodeCount === undefined || remainingEpisode <= sequelEpisodeCount) {
      return { anilistId: String(fullSequel.id), episode: remainingEpisode };
    }

    const nested = await resolveEpisodeInAniListChain(fullSequel, remainingEpisode, visited);
    if (nested && nested.anilistId !== String(fullSequel.id)) {
      return nested;
    }

    remainingEpisode -= sequelEpisodeCount;
  }

  return { anilistId: String(media.id), episode };
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
      const score = scoreAniListCandidate(media, title, season, year);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = media;
      }
    }
  }

  if (year) {
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
      const score = scoreAniListCandidate(media, title, season, year);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = media;
      }
    }
  }

  return bestMatch ? String(bestMatch.id) : null;
}

export async function resolveAniListEpisodeAddress(args: {
  anilistId?: string | null;
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
  episode: number;
}): Promise<AniListEpisodeAddress | null> {
  const localEpisode = Math.max(1, Math.floor(args.episode));
  const anilistId =
    args.anilistId ??
    (await resolveAniListId({
      title: args.title,
      season: args.season,
      seasonTitle: args.seasonTitle,
      year: args.year
    }));

  if (!anilistId) return null;

  const media = await fetchAniListMediaById(anilistId);
  if (!media) {
    return { anilistId, episode: localEpisode };
  }

  return (
    (await resolveEpisodeInAniListChain(media, localEpisode, new Set<number>())) ?? {
      anilistId,
      episode: localEpisode
    }
  );
}
