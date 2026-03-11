# Routa — SF / Marin Ride Planner

Bike route planner for San Francisco and Marin County. Enter a starting neighborhood, set your distance and elevation preferences, and get a curated cycling route with an interactive map, elevation profile, and GPX export.

## Features

- **Route generation** — 3 curated templates: Golden Gate Loop, Golden Gate to Sausalito, Ocean Beach & Sunset
- **Interactive map** — Leaflet with OpenStreetMap tiles, start/end markers, route overlay
- **Elevation profiles** — SVG elevation chart with color-coded difficulty ratings
- **Flexible inputs** — Distance (4–60 mi), elevation preference (flat to very hilly), loop or out-and-back
- **GPX export** — Download routes for Strava, Garmin Connect, Wahoo, or any GPX-compatible device
- **Strava integration** — OAuth connect flow (bring your own client ID)
- **SF neighborhood geocoding** — Recognizes Russian Hill, Marina, Mission, Castro, Presidio, Sausalito, and more

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Tech

- React 19 + Vite
- Leaflet (loaded via iframe srcdoc — zero CORS issues)
- OpenStreetMap / Public Domain Map tiles
- No backend required — runs entirely client-side

## Roadmap

- [ ] Real routing via OpenRouteService cycling profile
- [ ] Live geocoding (Mapbox / Google)
- [ ] Coffee stop waypoints (Google Places API)
- [ ] Strava OAuth with real credentials
- [ ] Mobile-optimized layout
