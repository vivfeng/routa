# Routa — SF / Marin Ride Planner

Cycling route planner for San Francisco and Marin with curated rides, road-snapped maps, elevation summaries, and GPX export.

Routa is a lightweight ride-planning app for cyclists who know the kind of ride they want, but do not want to build it point by point in a traditional mapping tool. Instead of dragging a route around Strava or Garmin to avoid bad roads or too much climbing, you set a starting point, choose your target distance, pick an elevation preference, and decide between a loop or an out-and-back. Routa then returns a curated SF/Marin ride, renders it on an interactive map, summarizes the climbing, and lets you export the route as GPX.

The current product is intentionally narrow: it focuses on a small set of high-signal route templates around San Francisco and Marin, client-side neighborhood lookup, fast browser-based rendering, and a simple export workflow. It is designed as a front-end prototype that demonstrates the product experience without requiring a backend.

## Why Routa

- Route planning starts from ride intent, not manual map editing
- The app is optimized for common SF/Marin recreational road rides
- Curated templates keep suggestions scenic and understandable
- Everything runs in the browser, including route generation and GPX export

## Features

- **Signal-based route input** — Choose a starting neighborhood or GPS, target distance, climbing preference, and route type
- **Curated ride templates** — Includes Golden Gate Loop, Golden Gate to Sausalito, and Ocean Beach & Sunset
- **Road-snapped map rendering** — Uses OSRM geometry on top of Leaflet and OpenStreetMap tiles
- **Route summaries** — View distance, elevation gain, average climbing intensity, and estimated ride time
- **Elevation preview** — Inline elevation chart for a quick read on ride difficulty
- **Scenic context** — Route tags and scenic zones call out notable segments and landmarks
- **GPX export** — Download a valid GPX file for Strava, Garmin Connect, Wahoo, and other compatible tools
- **Strava connect stub** — Includes the client-side OAuth entry point for a future full integration
- **Client-side geocoding** — Supports common SF and Marin neighborhoods via a built-in lookup table

## How It Works

1. Enter a starting location or use the GPS shortcut.
2. Set distance, elevation preference, and route type.
3. Routa selects a matching route template and offsets it from the user’s start point.
4. The app requests road-following geometry from OSRM and renders the result in an embedded Leaflet map.
5. The final route can be reviewed in overview, elevation, and scenic tabs, then exported as GPX.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Tech Stack

- React 19 + Vite
- Leaflet loaded inside an `iframe srcDoc`
- OpenStreetMap / Public Domain Map tiles
- OSRM-based route geometry fetch with browser-side fallback behavior
- GPX file generation via `Blob` and `URL.createObjectURL`
- No backend required

## Current Scope

- Geographic focus is limited to San Francisco and Marin
- Route selection is based on three curated templates, not open-ended routing
- Start-point geocoding uses a local lookup table rather than a live geocoding API
- Strava connect is present as a front-end flow, but full OAuth completion still requires real credentials and backend handling
- Coffee stop support is previewed in the UI but not implemented yet

## Roadmap

- [ ] Expand beyond fixed route templates into more dynamic ride generation
- [ ] Live geocoding (Mapbox / Google)
- [ ] Coffee stop waypoints (Google Places API)
- [ ] Strava OAuth with real credentials
- [ ] Mobile-optimized layout
