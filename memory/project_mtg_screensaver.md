---
name: MTG Screensaver — project context
description: Vue 3 fullscreen MTG card art screensaver using Scryfall API with A/B crossfade and configurable filters
type: project
---

Vue 3 + Vite screensaver web app at `/home/tim/local/www/projects/mtg-screensaver`. Run with `yarn dev`.

**Why:** Fullscreen heroic fantasy art display for monitors/screens, cycling MTG card art every 15s with smooth crossfade.

**How to apply:** All filtering happens client-side via Scryfall query strings. No images stored locally — pure remote URL display.

## Architecture

- `index.html` — entry point
- `src/main.js` — Vue app mount
- `src/App.vue` — all screensaver UI (slots, config panel, keyboard shortcuts)
- `src/composables/useScryfall.js` — Scryfall API: `fetchCard()`, `buildQuery()`, `preloadImage()`

## Key behaviors

- A/B slot crossfade: two stacked `<div>` elements, CSS `opacity` transition, swap activeSlot index
- Config persisted to `localStorage` key `mtg-screensaver-config`
- Default Scryfall query: `is:highres game:paper -is:universesbeyond -set_type:funny year>=2015 (set_type:expansion OR set_type:core OR ...)`
- Handles double-faced cards (checks `card_faces[0].image_uris`)
- Keyboard: Space/N=next, P=pause, C=config, F=fullscreen, Esc=close config

## Default config

- Interval: 15s, Transition: 2s, Fit: cover
- Min year: 2015, Exclude UB: true, Exclude funny: true
- Set types: expansion, core, masters, draft_innovation, commander
