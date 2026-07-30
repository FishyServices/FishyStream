# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People browsing and watching movies, TV shows, and anime across desktop web browsers and native Android mobile devices. Users need to discover content quickly, jump back into active shows, search titles seamlessly, and start video playback with minimal friction.

## Product Purpose

FishyStream provides a fast, free, open-source streaming experience without ad clutter or payload bloat. Success means instant stream resolution, fluid cross-device playback, responsive mobile navigation, and seamless state persistence across sessions.

## Positioning

A high-speed, ad-free streaming aggregator powered by extensible custom provider scraper packages (`@fishy/providers`, `@fishy/scraper`), paired with Convex cloud persistence and Clerk authentication for synchronized watch states across devices.

## Operating Context

Used in relaxed personal environments (phones on-the-go, tablets, laptops, and desktop screens) where rapid content discovery, quick episode switching, touch-friendly player controls, and reliable stream fallback are critical.

## Capabilities and Constraints

- **Capabilities**: Multi-source video stream scraping & aggregation, HLS video player (`hls.js`), Clerk user authentication, Convex backend data persistence, watch progress tracking, search & discover feeds, native Android packaging via Capacitor.
- **Technical Constraints**: Monorepo setup (`packages/providers`, `packages/scraper`), Vite + React 19 + Tailwind CSS 4 frontend, Cloudflare Puppeteer / scraper backend, Capacitor 8 for Android compilation.
- **Platform Scope**: Adaptive design supporting both desktop/mobile browsers (`web`) and Android native app (`android`).

## Brand Commitments

- **Name**: FishyStream
- **Voice & Personality**: Confident, cinematic, fast. Immersive without being heavy or cluttered.
- **Live Reference**: https://master.fishystream-app.pages.dev

## Evidence on Hand

- Runnable web application (`src/`, `vite.config.ts`, Cloudflare Pages deployment).
- Monorepo scraper & provider packages (`packages/scraper`, `packages/providers`).
- Android Capacitor project scaffold (`android/`, `capacitor.config.ts`).
- Public code repository (`https://github.com/official-notfishvr/FishyStream.git`).

## Product Principles

1. **Playback First**: Prioritize stream discovery and immediate playback performance over decorative chrome.
2. **Mobile Equivalence**: Preserve all core actions on mobile touch devices; adapt interactions rather than hiding features behind hover states.
3. **Fluid Adaptation**: Maintain responsive layout rhythm across small mobile touchscreens to wide desktop displays.
4. **Cinematic Precision**: Deliver a sleek dark interface with high-contrast metadata, readable typography, and restrained motion.

## Accessibility & Inclusion

- Touch targets optimized for small mobile displays (minimum 44x44px).
- High contrast metadata and readable typography against dark cinematic backgrounds.
- Keyboard accessible player controls and navigation for desktop users.
