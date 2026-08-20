# Domain context

Use these terms when describing code and tests.

## Content

**Content** is a movie or TV title identified by a TMDB content ID. A `ContentCard` supports grids and rows. A `ContentDetail` supports the detail modal. A `ContentPlayback` contains the identifiers needed to resolve a watch session.

**Catalog** is the read side of discovery. It turns provider metadata into FishyStream content shapes for home, browse, search, detail, seasons, credits, videos, and recommendations.

**Recommendation seed** is a watched, saved, or currently watched title used to choose related content. Folder scope can include or exclude saved titles from the seed set.

## Playback

**Playback session** is the selected content, episode target, source list, selected provider, embed URL, resume position, and loading/error state needed by the video player.

**Stream source** is a provider URL candidate for one movie or episode. The provider catalog builds candidates; the playback session selects one.

**Provider catalog** is the collection of external stream adapters and their URL, capability, origin, and progress metadata.

## Viewer state

**Watchlist** is a viewer's saved content, optionally grouped into folders.

**Watch history** is the viewer's recorded playback state, including completion and episode position.

**Watch progress** is the position and duration written during playback. Convex stores the signed-in copy; local storage stores device-only preferences and caches.

## Ownership rule

Catalog modules own content acquisition and normalization. Playback modules own source selection and session state. Library modules own watchlist, history, and progress. UI modules render these results and send user events through their interfaces.
