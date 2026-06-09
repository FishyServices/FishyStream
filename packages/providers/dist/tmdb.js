// ─── Constants ────────────────────────────────────────────────────────────────
export const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_BASE_URL_2 = "https://api.tmdb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export const GENRE_MAP = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Sci-Fi",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
    10759: "Action & Adventure",
    10762: "Kids",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics"
};
export const TMDB_DISCOVER_GENRES = {
    action: 28,
    adventure: 12,
    animation: 16,
    comedy: 35,
    crime: 80,
    documentary: 99,
    drama: 18,
    family: 10751,
    fantasy: 14,
    history: 36,
    horror: 27,
    music: 10402,
    mystery: 9648,
    romance: 10749,
    "science fiction": 878,
    "sci-fi": 878,
    thriller: 53,
    war: 10752,
    western: 37
};
// ─── Image / URL helpers ──────────────────────────────────────────────────────
export function getPosterUrl(path, size = "w500") {
    if (!path)
        return "https://placehold.co/500x750/1a1a2e/666?text=No+Poster";
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
export function getBackdropUrl(path) {
    if (!path)
        return "https://placehold.co/1920x1080/0a0a12/333?text=No+Backdrop";
    return `${TMDB_IMAGE_BASE}/original${path}`;
}
export function getStillUrl(path) {
    if (!path)
        return "";
    return `${TMDB_IMAGE_BASE}/w500${path}`;
}
export function getProfileUrl(path) {
    if (!path)
        return "";
    return `${TMDB_IMAGE_BASE}/w185${path}`;
}
// ─── Metadata helpers ─────────────────────────────────────────────────────────
export function getGenres(item) {
    if (item.genres?.length)
        return item.genres.map((g) => g.name);
    return (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean);
}
export function getYear(date) {
    if (!date)
        return new Date().getFullYear();
    const year = parseInt(date.split("-")[0] ?? String(new Date().getFullYear()));
    return Number.isFinite(year) ? year : new Date().getFullYear();
}
export function getRating(voteAverage, certificationOrRating) {
    if (certificationOrRating) {
        const r = certificationOrRating.trim().toUpperCase();
        const known = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"];
        if (known.includes(r))
            return r;
        if (r === "U" || r === "U/A")
            return "PG";
        if (r === "A")
            return "R";
        if (r === "18" || r === "18+")
            return "R";
        if (r === "15" || r === "16+")
            return "PG-13";
        if (r === "12" || r === "12A" || r === "13+")
            return "PG-13";
    }
    if (voteAverage >= 7.5)
        return "PG-13";
    if (voteAverage >= 5)
        return "PG";
    return "G";
}
export function getLogoUrl(logos) {
    if (!logos?.length)
        return undefined;
    const en = logos
        .filter((l) => l.iso_639_1 === "en")
        .sort((a, b) => b.vote_average - a.vote_average)[0];
    const best = en ?? logos.sort((a, b) => b.vote_average - a.vote_average)[0];
    if (!best)
        return undefined;
    return `${TMDB_IMAGE_BASE}/w500${best.file_path}`;
}
export function getTrailerKey(videos) {
    if (!videos?.length)
        return undefined;
    const priority = ["Official Trailer", "Trailer", "Teaser", "Clip", "Featurette"];
    for (const type of priority) {
        const v = videos.find((v) => v.site === "YouTube" && v.type === type && v.official);
        if (v)
            return v.key;
    }
    return videos.find((v) => v.site === "YouTube" && v.type === "Trailer")?.key;
}
export function isAnimeLikeContent(args) {
    if (args.type !== "tv")
        return false;
    return (args.originalLanguage?.toLowerCase() === "ja" &&
        args.genres.some((g) => g.toLowerCase() === "animation"));
}
export function formatRuntime(minutes) {
    if (!minutes || minutes <= 0)
        return undefined;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export function shuffleWithSeed(items, seed) {
    return items
        .map((item, index) => {
        const score = Math.sin((index + 1) * 999 + seed * 9973) * 10000;
        return { item, score: score - Math.floor(score) };
    })
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item);
}
export async function mapInBatches(items, batchSize, fn) {
    const out = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const results = await Promise.all(batch.map((item, bi) => fn(item, i + bi)));
        out.push(...results);
    }
    return out;
}
// ─── Season payload helpers ───────────────────────────────────────────────────
export function mapTmdbSeasonToCanonicalPayload(data, seasonNumber) {
    return {
        seasonNumber,
        name: data.name,
        overview: data.overview || undefined,
        posterUrl: data.poster_path ? getPosterUrl(data.poster_path) : undefined,
        airDate: data.air_date ?? undefined,
        episodeCount: data.episodes?.length ?? 0,
        year: getYear(data.air_date ?? undefined),
        episodes: (data.episodes ?? []).map((ep) => ({
            episodeNumber: ep.episode_number,
            name: ep.name,
            overview: ep.overview || undefined,
            stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
            airDate: ep.air_date ?? undefined,
            runtime: ep.runtime ?? undefined,
            voteAverage: ep.vote_average
        }))
    };
}
export function compactSeasonEpisodesForDb(episodes) {
    return episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        name: ep.name,
        stillUrl: ep.stillUrl,
        runtime: ep.runtime,
        voteAverage: ep.voteAverage
    }));
}
export function hasEpisodes(data) {
    return (data?.episodes?.length ?? 0) > 0;
}
class SimpleCache {
    store = new Map();
    keySerializer;
    constructor(keySerializer) {
        this.keySerializer = keySerializer ?? ((k) => JSON.stringify(k));
    }
    get(key) {
        const s = this.keySerializer(key);
        const entry = this.store.get(s);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiry) {
            this.store.delete(s);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlSeconds) {
        this.store.set(this.keySerializer(key), {
            value,
            expiry: Date.now() + ttlSeconds * 1000
        });
    }
    clear() {
        this.store.clear();
    }
}
const _serverCache = new SimpleCache((k) => `${k.url}|${JSON.stringify(k.params)}|${k.language}`);
let _proxyIndex = 0;
function _nextProxy(proxyUrls) {
    if (!proxyUrls.length)
        return undefined;
    return proxyUrls[_proxyIndex++ % proxyUrls.length];
}
function _isV4Token(key) {
    return key.split(".").length === 3;
}
export async function tmdbGet(endpoint, params = {}, proxyUrls = []) {
    const language = params.language ?? "en-US";
    const cacheKey = { url: endpoint, params, language };
    const cached = _serverCache.get(cacheKey);
    if (cached !== undefined)
        return cached;
    const apiKey = TMDB_API_KEY;
    const headers = { accept: "application/json" };
    if (_isV4Token(apiKey))
        headers.Authorization = `Bearer ${apiKey}`;
    const allParams = {
        ...params,
        language,
        ...(!_isV4Token(apiKey) ? { api_key: apiKey } : {})
    };
    const buildUrl = (base) => {
        const url = new URL(base + endpoint);
        for (const [k, v] of Object.entries(allParams)) {
            if (v !== undefined && v !== null)
                url.searchParams.append(k, String(v));
        }
        return url.toString();
    };
    let result = null;
    const proxy = _nextProxy(proxyUrls);
    if (proxy) {
        try {
            const res = await fetch(`${proxy}/?destination=${encodeURIComponent(buildUrl(TMDB_BASE_URL))}`, { headers, signal: AbortSignal.timeout(5000) });
            if (res.ok)
                result = (await res.json());
        }
        catch {
            /* fall through */
        }
    }
    if (!result) {
        try {
            const res = await fetch(buildUrl(TMDB_BASE_URL), {
                headers,
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok)
                result = (await res.json());
        }
        catch {
            /* fall through */
        }
    }
    if (!result) {
        try {
            const res = await fetch(buildUrl(TMDB_BASE_URL_2), {
                headers,
                signal: AbortSignal.timeout(30000)
            });
            if (res.ok)
                result = (await res.json());
        }
        catch {
            return null;
        }
    }
    if (result)
        _serverCache.set(cacheKey, result, 3600);
    return result;
}
// ─── Browser-side fetch helpers ───────────────────────────────────────────────
export function buildTmdbUrl(path, apiKey, params = {}) {
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", "en-US");
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined)
            url.searchParams.set(k, String(v));
    }
    return url.toString();
}
export async function fetchTmdbList(path, apiKey, signal, params) {
    const res = await fetch(buildTmdbUrl(path, apiKey, params), { signal });
    if (!res.ok)
        throw new Error(`TMDB ${path} failed: ${res.status}`);
    return (await res.json());
}
export async function fetchTmdbListOrEmpty(path, apiKey, signal, params) {
    try {
        return await fetchTmdbList(path, apiKey, signal, params);
    }
    catch {
        return { results: [] };
    }
}
export async function fetchTmdbCredits(tmdbId, type, apiKey, signal) {
    const url = buildTmdbUrl(`/${type}/${tmdbId}/credits`, apiKey);
    try {
        const res = await fetch(url, { signal });
        if (!res.ok)
            return null;
        const data = (await res.json());
        return {
            cast: data.cast.slice(0, 20).map((c) => ({
                id: c.id,
                name: c.name,
                character: c.character,
                profileUrl: getProfileUrl(c.profile_path),
                order: c.order
            })),
            directors: data.crew.filter((c) => c.job === "Director").map((c) => c.name)
        };
    }
    catch {
        return null;
    }
}
export async function fetchTmdbVideos(tmdbId, type, apiKey, signal) {
    const url = buildTmdbUrl(`/${type}/${tmdbId}/videos`, apiKey);
    try {
        const res = await fetch(url, { signal });
        if (!res.ok)
            return [];
        const data = (await res.json());
        return (data.results ?? [])
            .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
            .map((v) => ({ key: v.key, name: v.name, type: v.type, official: v.official }));
    }
    catch {
        return [];
    }
}
export async function fetchTmdbRelated(tmdbId, type, apiKey, limit = 10, signal) {
    const url = buildTmdbUrl(`/${type}/${tmdbId}/recommendations`, apiKey);
    try {
        const res = await fetch(url, { signal });
        if (!res.ok)
            return [];
        const data = (await res.json());
        return (data.results ?? []).slice(0, limit).map((item) => {
            const isMovie = "title" in item;
            return {
                tmdbId: item.id,
                title: isMovie ? item.title : item.name,
                type: (isMovie ? "movie" : "tv"),
                posterUrl: getPosterUrl(item.poster_path),
                year: getYear(isMovie
                    ? item.release_date
                    : item.first_air_date),
                voteAverage: item.vote_average,
                genre: getGenres(item),
                rating: getRating(item.vote_average ?? 0)
            };
        });
    }
    catch {
        return [];
    }
}
export function toTMDBContentCard(item, typeHint) {
    const type = typeHint ?? (item.media_type === "movie" || item.media_type === "tv" ? item.media_type : null);
    if (!type || item.media_type === "person")
        return null;
    const title = type === "movie" ? item.title : item.name;
    if (!item.id || !title || !item.poster_path)
        return null;
    const dateStr = type === "movie" ? item.release_date : item.first_air_date;
    const year = dateStr ? getYear(dateStr) : new Date().getFullYear();
    return {
        tmdbId: String(item.id),
        title,
        type,
        year,
        posterUrl: getPosterUrl(item.poster_path),
        voteAverage: item.vote_average,
        genre: (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean),
        isNew: false
    };
}
export function toTMDBItem(item, type) {
    return {
        tmdbId: item.id,
        title: (type === "movie" ? item.title : item.name) ?? "",
        posterUrl: getPosterUrl(item.poster_path ?? null),
        year: getYear(type === "movie" ? item.release_date : item.first_air_date),
        genre: (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean),
        rating: getRating(item.vote_average ?? 0),
        voteAverage: item.vote_average,
        type
    };
}
export function tmdbSortParam(sortBy, type) {
    if (sortBy === "new" || sortBy === "year")
        return type === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
    if (sortBy === "rating")
        return "vote_average.desc";
    return "popularity.desc";
}
export async function fetchTmdbDetails(tmdbId, type, apiKey, signal) {
    const url = buildTmdbUrl(`/${type}/${tmdbId}`, apiKey, { append_to_response: "videos,images" });
    try {
        const res = await fetch(url, { signal });
        if (!res.ok)
            return null;
        const d = (await res.json());
        return {
            description: d.overview ?? "No description available",
            backdropUrl: d.backdrop_path ? getBackdropUrl(d.backdrop_path) : "",
            rating: getRating(d.vote_average ?? 0),
            logoUrl: getLogoUrl(d.images?.logos),
            trailerKey: getTrailerKey(d.videos?.results),
            duration: type === "movie" ? formatRuntime(d.runtime) : undefined,
            seasons: type === "tv" ? d.number_of_seasons : undefined,
            tagline: d.tagline ?? undefined,
            originalLanguage: d.original_language
        };
    }
    catch {
        return null;
    }
}
export async function fetchTmdbSearch(query, apiKey, signal) {
    const encoded = encodeURIComponent(query);
    const [moviesRes, showsRes] = await Promise.all([
        fetchTmdbListOrEmpty("/search/movie", apiKey, signal ?? new AbortController().signal, {
            query: encoded
        }),
        fetchTmdbListOrEmpty("/search/tv", apiKey, signal ?? new AbortController().signal, {
            query: encoded
        })
    ]);
    return {
        movies: (moviesRes.results ?? []).map((item) => toTMDBItem(item, "movie")),
        shows: (showsRes.results ?? []).map((item) => toTMDBItem(item, "tv"))
    };
}
export async function fetchTmdbDiscover(type, apiKey, signal, opts = {}) {
    const params = {
        page: opts.page ?? 1,
        sort_by: tmdbSortParam(opts.sortBy ?? "popular", type),
        with_genres: opts.genreId,
        "vote_count.gte": opts.minVoteCount ?? 25
    };
    const res = await fetchTmdbListOrEmpty(`/discover/${type}`, apiKey, signal, params);
    return {
        items: (res.results ?? [])
            .map((item) => toTMDBContentCard(item, type))
            .filter((c) => !!c),
        totalPages: res.total_pages ?? 1,
        totalResults: res.total_results ?? 0
    };
}
export function collectTmdbCards(responses, opts = {}) {
    const seen = new Set();
    const cards = [];
    for (const { data, type } of responses) {
        for (const item of data.results ?? []) {
            const card = toTMDBContentCard(item, type);
            if (!card?.tmdbId)
                continue;
            const key = `${card.type}:${card.tmdbId}`;
            if (opts.excludedIds?.has(key) || seen.has(key))
                continue;
            if (opts.typeFilter && opts.typeFilter !== "all" && card.type !== opts.typeFilter)
                continue;
            seen.add(key);
            cards.push(card);
        }
    }
    return cards;
}
