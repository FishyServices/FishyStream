---
name: FishyStream
description: High-speed, cinematic, ad-free streaming aggregator for movies, TV shows, and anime.
colors:
  primary: "oklch(0.62 0.1 182)"
  primary-foreground: "oklch(0.15 0.01 240)"
  background: "oklch(0.15 0.01 240)"
  foreground: "oklch(0.95 0.008 240)"
  card: "oklch(0.19 0.012 240)"
  card-foreground: "oklch(0.95 0.008 240)"
  muted: "oklch(0.23 0.01 240)"
  muted-foreground: "oklch(0.72 0.012 240)"
  accent: "oklch(0.27 0.012 240)"
  destructive: "oklch(0.58 0.18 24)"
  border: "oklch(0.29 0.012 240)"
  warning: "oklch(0.78 0.12 85)"
typography:
  display:
    fontFamily: "Space Grotesk, Instrument Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: "0.95"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Space Grotesk, Instrument Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Space Grotesk, Instrument Sans, ui-sans-serif, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.3"
  body:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: "1"
    letterSpacing: "0.2em"
rounded:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.625rem 1.5rem"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.625rem 1.25rem"
  card-media:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "0rem"
---

# Design System: FishyStream

## Overview

**Creative North Star: "The Abyssal Cinema"**

FishyStream's design system establishes a high-contrast, immersive dark environment built for zero-friction media discovery and video playback. Derived directly from `src/index.css` and `@fishy/ui` component implementations, the visual identity pairs deep ocean dark backgrounds (`oklch(0.15 0.01 240)`) with indigo/cyan highlights (`oklch(0.62 0.1 182)`), clean display typography (`Space Grotesk`), and tactile glassmorphic containers (`.media-surface`, `.fishy-glass`).

The app shell seamlessly scales across touch screens and desktop monitors:

- **Desktop**: Left fixed navigation rail (`.app-rail`, `md:w-18`, `xl:w-62`) with main view offset (`md:pl-18`, `xl:pl-62`).
- **Mobile**: Sticky topbar (`.app-topbar`, `min-h-16`) paired with fixed bottom navigation (`.app-bottom-nav`) honoring `env(safe-area-inset-bottom)`.

**Key Characteristics:**

- **Cinematic Radial Gradients**: Radial background glows blending primary cyan at 16% and 8% opacity onto dark slate canvas.
- **Theme & Accent Customization**: Supports runtime theme switches (`dark`, `light`) and custom accents (`cyan`, `indigo`, `rose`, `emerald`).
- **Dynamic Density & Corner Radii**: Configurable density modes (`compact`, `touch`) and radius styles (`sharp`, `rounded`, `playful`).
- **Glassmorphism & Surface Elevation**: Backdrop-blurred cards (`backdrop-blur-xl`, `backdrop-blur-sm`) with fine borders (`border-border/65`).

## Colors

The color palette is anchored in OKLCH dark mode tokens defined in `node_modules/@fishy/ui/src/index.css` and `src/index.css`.

### Primary & Accents

- **Deep Ocean Cyan / Indigo** (`oklch(0.62 0.1 182)`): Primary action color for buttons (`bg-primary`), progress meters (`.media-progress > span`), active nav items, and focus rings (`focus-visible:ring-primary/70`).
- **Cyan Accent** (`oklch(0.7 0.14 200)`): Variant option via `data-fishy-accent="cyan"`.
- **Rose Accent** (`oklch(0.65 0.18 15)`): Variant option via `data-fishy-accent="rose"`.
- **Emerald Accent** (`oklch(0.68 0.15 145)`): Variant option via `data-fishy-accent="emerald"`.

### Neutral Surfaces

- **Abyssal Background** (`oklch(0.15 0.01 240)`): Base canvas (`--color-background`).
- **Midnight Card** (`oklch(0.19 0.012 240)`): Elevated card containers (`--color-card`).
- **Popover Surface** (`oklch(0.205 0.012 240)`): Tooltips, dropdown selects, and modal popovers (`--color-popover`).
- **Muted Surface** (`oklch(0.23 0.01 240)`): Inactive tab pills, skeleton loaders (`.poster-skeleton`), and inputs.
- **Foreground Text** (`oklch(0.95 0.008 240)`): Primary headings and high-contrast body text.
- **Muted Foreground** (`oklch(0.72 0.012 240)`): Subtitles, release years, metadata rows, and secondary labels.
- **Border / Line** (`oklch(0.29 0.012 240)`): Subtle boundary strokes (`.subtle-line`, `border-border/65`).

### Feedback & Rating Badges

- **Destructive Red** (`oklch(0.58 0.18 24)`): Error notifications and removal triggers.
- **Warning Yellow** (`oklch(0.78 0.12 85)`): Fallback alerts.
- **Content Ratings**: Rating badges color-coded via `.rating-G` (emerald), `.rating-PG` (sky), `.rating-PG-13` (amber), `.rating-R` (orange), `.rating-TV-MA` (rose).

### Named Rules

**The Ten Percent Accent Rule.** Primary cyan accenting is used on ≤10% of any screen viewport. Content posters and video streams remain the hero visual elements.

## Typography

**Display Font:** Space Grotesk (with Instrument Sans, ui-sans-serif fallback)  
**Body Font:** Instrument Sans (with ui-sans-serif, system-ui fallback)  
**Monospace / Eyebrow Font:** IBM Plex Mono

### Hierarchy

- **Display** (font-semibold / font-bold, `clamp(2rem, 5vw, 3.5rem)`, leading `0.95`, tracking-tight): Hero carousel titles, section headers.
- **Headline** (font-semibold, `clamp(1.5rem, 3vw, 2.25rem)`, leading `1.2`): Modal headers and view titles.
- **Title** (font-semibold, `1.125rem`, leading `1.3`): Poster card titles, episode names.
- **Body** (font-normal, `0.9375rem`, leading `1.5`): Synopsis copy, search descriptions (max 75ch length).
- **Label / Eyebrow** (font-bold, `0.6875rem`, uppercase, tracking `0.2em`): Category tags, resolution badges (4K, HD, 1080p).

### Named Rules

**The Eyebrow Rule.** All section kickers and metadata labels use `.eyebrow` or `.text-label` with `uppercase` and `tracking-[0.2em]`.

## Layout

FishyStream uses fluid page shell containers defined in `src/index.css`:

- `.page-shell`: Standard container (`width: min(100% - 1.5rem, 92rem)`).
- `.page-shell-tight`: Compact container (`width: min(100% - 1rem, 92rem)`).
- `.page-shell-wide`: Full width container (`width: min(100% - 2rem, 175rem)`).
- `.page-shell-hero`: Hero banner container (`width: min(100% - 1.5rem, 108rem)`).

Responsive Layout Rules:

- **Desktop**: Left fixed navigation rail (`.app-rail` md:w-18, xl:w-62).
- **Mobile**: Topbar (`.app-topbar`) + bottom navbar (`.app-bottom-nav` with `env(safe-area-inset-bottom)`).
- **Grid Layouts**: Poster grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6`).

## Elevation & Depth

- **Radial Ambient Glows**: Canvas incorporates subtle background glows using `radial-gradient(circle at 12% -10%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 28rem)`.
- **Glassmorphism**: Panels (`.media-surface`, `.fishy-glass`) combine `bg-card/78` or `bg-card/92` with `backdrop-blur-xl` or `backdrop-blur-sm` and soft border stokes (`border-border/65`).
- **Hover Micro-interactions**: Interactive elements use `.fishy-lift` or `active:scale-[0.985]` (`.interactive-scale`) with drop shadow `shadow-[0_18px_60px_color-mix(in_oklab,var(--color-background)_78%,transparent)]`.

### Named Rules

**The Tonal Surface Rule.** Layering proceeds from canvas (`--surface-1`), card containers (`--surface-2`), to popovers/modals (`--surface-3`), maintaining consistent depth without heavy artificial drop shadows.

## Shapes

- **Standard Corner Radius**: `0.75rem` (12px) for cards, `0.5rem` (8px) for buttons/inputs, `0.25rem` (4px) for pill tags.
- **Dynamic Density Presets**: `:root[data-fishy-density="compact"]` and `:root[data-fishy-density="touch"]`.
- **Dynamic Radius Styles**: `:root[data-fishy-radius="sharp"]`, `:root[data-fishy-radius="rounded"]`, and `:root[data-fishy-radius="playful"]`.

## Components

### Buttons

- **Shape:** Rounded XL (`rounded-xl` / `0.75rem`).
- **Primary:** `bg-primary text-primary-foreground font-medium px-6 py-2.5 shadow-lg shadow-primary/25 hover:bg-primary/90`.
- **Secondary:** `bg-card/75 border border-border/75 text-foreground backdrop-blur-sm hover:bg-accent`.
- **Ghost:** `bg-transparent text-foreground hover:bg-accent`.

### Poster Cards (`MovieCard.tsx`)

- **Aspect Ratio:** Aspect `2/3` with rounded XL corners (`rounded-xl`).
- **Border:** `border border-border/55 bg-card shadow-md`.
- **Hover:** `md:scale-[1.025] md:z-20 md:shadow-2xl md:shadow-primary/15 md:ring-1 md:ring-primary/50`.
- **Mobile Actions:** Quick touch action overlay (`showMobileActions`).

### Hero Carousel (`DiscoverPage.tsx`)

- **Height:** Responsive height `h-[72svh] sm:h-[80vh]` with background backdrop image crossfade.
- **Gradient Overlays**: Gradient transitions `from-background via-background/60 to-transparent` horizontally and vertically.

### Video Player (`CustomVideoPlayer.tsx`, `VideoPlayer.tsx`)

- **Controls**: Custom touch-optimized playback overlay, progress scrub bar (`.media-progress`), provider selector modal (`ProviderSourceSelect.tsx`).

## Do's and Don'ts

### Do:

- **Do** place all persistent AI context files in `docs/` (`docs/PRODUCT.md`, `docs/DESIGN.md`).
- **Do** honor touch target sizes (minimum 44x44px `.touch-target`) on mobile viewports.
- **Do** use `env(safe-area-inset-bottom)` on fixed mobile navigation bars to support native Android / iOS bottom gesture bars.
- **Do** apply `Space Grotesk` font family for section titles and hero headlines.

### Don't:

- **Don't** rely on hover-only states for critical playback or navigation actions on touch screens.
- **Don't** override OKLCH color variables with arbitrary hex colors in component inline styles.
- **Don't** remove `backdrop-blur-xl` or glassmorphic styling from sticky topbars or navigation rails.
