# RideRouta — SF / Marin Ride Planner

Cycling route planner for San Francisco and Marin with natural language route creation, road-snapped maps, elevation summaries, and GPX export.

RideRouta lets cyclists create rides by describing what they want in plain English — or by using a form for more control. Instead of dragging waypoints around Strava or Garmin to avoid bad roads or too much climbing, you tell Routa where you want to go and it builds the route for you. It geocodes your start and destination, fetches bike-friendly geometry from OSRM, renders the ride on an interactive map, summarizes the climbing, and lets you export the route as GPX.

Two ways to create a route:

- **Natural language** — Describe your ideal ride (e.g., "Ride from the Marina to Corte Madera and back") and the NLP parser extracts start, destination, distance, elevation preference, and route type.
- **Form mode** — Set your starting point, target distance, elevation preference, and route type (loop or out-and-back) for more granular control.

When a destination is specified, Routa builds a custom point-to-point or round-trip route between the two locations. When no destination is given, it selects from a set of curated SF/Marin loop and out-and-back templates that match the requested distance and effort level.

## Why RideRouta

- Route planning starts from ride intent, not manual map editing
- Natural language input lets you describe a ride the way you'd tell a friend
- Form mode gives full control over distance, elevation, and route type
- Everything runs in the browser, including route generation and GPX export

## Features

- **Natural language route creation** — Describe your ride in plain English and Routa figures out the rest
- **Form-based route input** — Choose a starting neighborhood or GPS, target distance, climbing preference, and route type
- **Custom destination routing** — Specify any destination in SF or Marin and get a geocoded, bike-routed path
- **Road-snapped map rendering** — Uses OSRM bike routing geometry on top of Leaflet and OpenStreetMap tiles
- **Route summaries** — View distance, elevation gain, average climbing intensity, and estimated ride time
- **Elevation preview** — Inline elevation chart for a quick read on ride difficulty
- **Scenic context** — Route tags and scenic zones call out notable segments and landmarks
- **GPX export** — Download a valid GPX file for Strava, Garmin Connect, Wahoo, and other compatible tools
- **Client-side geocoding** — Supports SF and Marin neighborhoods via built-in lookup, with Mapbox fallback for addresses not in the local table

## How It Works

1. Describe your ride in plain English, or switch to the form and set your parameters manually.
2. Routa parses your input — extracting start, destination, distance, elevation preference, and route type.
3. If a destination is specified, it geocodes both points and builds a custom route via OSRM bike routing.
4. If no destination is given, it selects the best-fit curated route for the requested distance and effort level.
5. The route is rendered on an interactive Leaflet map with road-snapped geometry.
6. Review the route in overview, elevation, and scenic tabs, then export as GPX.

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
- OSRM bike routing for road-snapped geometry
- Mapbox geocoding fallback for address resolution
- NLP parsing for natural language ride descriptions
- GPX file generation via `Blob` and `URL.createObjectURL`
- No backend required

## Current Scope

- Geographic focus is SF and Marin County
- Strava connect is present as a front-end flow, but full OAuth completion still requires real credentials and backend handling
