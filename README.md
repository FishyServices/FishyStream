# FishyStream

Live Url: https://master.fishystream-app.pages.dev

A free and open-source streaming platform for streaming movies and TV shows and anime.

Built to be fast, simple, and modern without unnecessary clutter.

## Features

- Fast streaming experience
- Free and Open source

## Development — Setup & Run

Clone the repo

```bash
git clone https://github.com/official-notfishvr/FishyStream.git
cd FishyStream
```

Environment

1. Copy the env.example file into `.env`:

2. Edit `.env` and set the following values (examples shown):

- `VITE_CONVEX_URL`=https://your-convex-app.convex.cloud
- `VITE_CONVEX_SITE_URL`=https://your-site-url.convex.site
- `VITE_CLERK_PUBLISHABLE_KEY`=pk_live_xxx
- `CLERK_JWT_ISSUER_DOMAIN`=https://<your-clerk-domain>.clerk.dev

Where to get values

- Convex: open your Convex project dashboard then go to settings and it will be under "Cloud URL" and "HTTP Actions URL"
- Clerk: in the Clerk dashboard, copy the **Publishable key** from your application, and use your Clerk issuer domain (shown in the dashboard).

Add Clerk JWT template for Convex

1. In the Clerk dashboard go to **Sessions** → **JWT templates**.
2. Click **Add new template** and choose **Convex**
3. Save the template.
