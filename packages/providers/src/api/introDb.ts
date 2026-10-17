export async function handleIntroDbRequest(request: Request) {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { Allow: "GET", "Content-Type": "application/json" }
    });
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL("https://api.theintrodb.org/v4/media");
  upstreamUrl.search = requestUrl.search;

  try {
    return await fetch(upstreamUrl, {
      headers: { Accept: "application/json" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "TheIntroDB is unavailable." }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}
