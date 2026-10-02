import { Hono } from "hono";

const downloadsApp = new Hono();

downloadsApp.get("/streamrip", async (c) => {
  const type = c.req.query("type");
  const id = c.req.query("id");
  const season = c.req.query("season");
  const episode = c.req.query("episode");

  if (!id) return c.json({ error: "Missing id parameter" }, 400);

  let targetUrl = "";
  if (type === "tv") {
    targetUrl = `https://streamrip.fun/api/download/tv/${id}?season=${season || 1}&episode=${episode || 1}`;
  } else {
    targetUrl = `https://streamrip.fun/api/download/movie/${id}`;
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) {
      const fallbackRes = await fetch(targetUrl);
      if (!fallbackRes.ok) throw new Error(`StreamRip returned status ${fallbackRes.status}`);
      return c.json(await fallbackRes.json());
    }
    return c.json(await res.json());
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

downloadsApp.get("/anisnatch", async (c) => {
  const id = c.req.query("id");
  const ep = c.req.query("episode") || "1";

  if (!id) return c.json({ error: "Missing id parameter" }, 400);

  const targetUrl = `https://dl.anisnatch.top/anime/${id}/${ep}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) throw new Error(`AniSnatch returned status ${res.status}`);

    const html = await res.text();
    const downloads: any[] = [];

    // Parse releases matching: <a href="/pahe/..." target="_blank" ... class="download-btn">
    const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*class="download-btn"[^\>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const contentStr = match[2];
      if (!href || !contentStr) continue;

      let label = "";
      const labelMatch = contentStr.match(/<span>([\s\S]*?)<\/span>/i);
      if (labelMatch && labelMatch[1]) {
        label = labelMatch[1].replace(/<[^>]*>/g, "").trim();
      } else {
        label = contentStr.replace(/<[^>]*>/g, "").trim();
      }

      let resolvedUrl = href;
      if (href.startsWith("/")) {
        resolvedUrl = `https://dl.anisnatch.top${href}`;
      }

      downloads.push({
        name: label || "Download",
        url: resolvedUrl
      });
    }

    return c.json({ downloads });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

downloadsApp.get("/animex", async (c) => {
  const query = c.req.query("q");
  const id = c.req.query("id");

  if (!query && !id) return c.json({ error: "Missing q or id parameter" }, 400);

  let targetUrl = "";
  if (id) {
    targetUrl = `https://pp.animex.one/rest/api/download?id=${encodeURIComponent(id)}`;
  } else if (query) {
    targetUrl = `https://pp.animex.one/rest/api/download?q=${encodeURIComponent(query)}`;
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://animex.one"
      }
    });
    if (!res.ok) throw new Error(`Animex returned status ${res.status}`);
    const data = await res.json();

    if (id && Array.isArray(data)) {
      const resolved = data.map((item: any) => ({
        text: item.text,
        url: `https://dl.animex.one/d/${item.url}`
      }));
      return c.json({ downloads: resolved });
    }

    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default downloadsApp;
