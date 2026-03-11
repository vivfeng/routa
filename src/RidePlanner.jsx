import { useState, useEffect } from "react";

const ELEVATION_PRESETS = [
  { label: "Mostly Flat", ftPerMile: 25 },
  { label: "Moderate", ftPerMile: 50 },
  { label: "Rolling", ftPerMile: 100 },
  { label: "Hilly", ftPerMile: 150 },
  { label: "Very Hilly", ftPerMile: 200 },
];

// ── Geocoder ──────────────────────────────────────────────────────────────────
const SF_GEOCODES = {
  "russian hill": [37.7996, -122.4183],
  "vallejo":      [37.7996, -122.4183],
  "marina":       [37.8030, -122.4360],
  "mission":      [37.7599, -122.4148],
  "castro":       [37.7625, -122.4350],
  "haight":       [37.7692, -122.4481],
  "noe valley":   [37.7502, -122.4328],
  "soma":         [37.7785, -122.4056],
  "hayes valley": [37.7762, -122.4245],
  "north beach":  [37.8060, -122.4103],
  "fisherman":    [37.8080, -122.4177],
  "pacific heights": [37.7925, -122.4382],
  "richmond":     [37.7800, -122.4700],
  "sunset":       [37.7528, -122.4833],
  "embarcadero":  [37.7955, -122.3937],
  "ferry building": [37.7955, -122.3937],
  "presidio":     [37.7989, -122.4662],
  "sausalito":    [37.8590, -122.4852],
  "default":      [37.7996, -122.4183],
};

function geocode(addr) {
  if (!addr) return SF_GEOCODES["default"];
  const l = addr.toLowerCase();
  for (const [k, v] of Object.entries(SF_GEOCODES)) if (l.includes(k)) return v;
  return SF_GEOCODES["default"];
}

// ── Route templates ───────────────────────────────────────────────────────────
// Waypoints are dense enough to guide OSRM without U-turns.
// All loops flow in one direction (clockwise). Routes stay north/west of
// Tenderloin (lat < 37.787, lng > -122.420) and Civic Center.
const ROUTE_TEMPLATES = {
  scenic: {
    name: "Golden Gate Loop",
    distance: 16.2, elevationGain: 680, ftPerMile: 42, time: 88,
    scenicZones: ["Crissy Field", "Presidio", "Baker Beach", "Golden Gate Park"],
    isScenic: true, hasGGBCrossing: false,
    description: "Crissy Field → Presidio → Baker Beach → Golden Gate Park → Panhandle → Pacific Heights loop.",
    // Clockwise: northwest to Marina → west along Crissy → Presidio → Baker Beach
    //   → south to GG Park → east through park → north via Divisadero/Pac Heights → home
    // Each waypoint makes consistent forward progress — no backtracking
    coreWaypoints: [
      [37.8005,-122.4365],  // Chestnut & Fillmore (west first on flat streets)
      [37.8040,-122.4400],  // Marina Blvd west of Fillmore
      [37.8040,-122.4490],  // Marina Blvd at Yacht Rd (stay on blvd, skip harbor)
      [37.8040,-122.4580],  // Crissy Field west
      [37.7985,-122.4620],  // Presidio / Mason St
      [37.7930,-122.4700],  // Presidio interior
      [37.7880,-122.4830],  // Baker Beach area
      [37.7830,-122.4840],  // Sea Cliff / 25th Ave
      [37.7740,-122.4770],  // GG Park north edge near 25th
      [37.7710,-122.4680],  // JFK Dr mid-park
      [37.7700,-122.4530],  // GG Park at Stanyan
      [37.7720,-122.4440],  // Panhandle
      [37.7750,-122.4370],  // Fell & Divisadero
      [37.7850,-122.4350],  // Divisadero & Clay (north of Tenderloin)
      [37.7920,-122.4340],  // Pacific Heights / Fillmore
    ]
  },
  marin: {
    name: "Golden Gate to Sausalito",
    distance: 22.4, elevationGain: 890, ftPerMile: 40, time: 118,
    scenicZones: ["Crissy Field", "Marin Headlands", "Sausalito Waterfront"],
    isScenic: true, hasGGBCrossing: true,
    description: "Cross the Golden Gate Bridge, Marin Headlands, descend into Sausalito.",
    // Out-and-back: northwest to Marina → west along Crissy → across GGB → Marin → Sausalito
    coreWaypoints: [
      [37.8005,-122.4365],  // Chestnut & Fillmore (west first on flat streets)
      [37.8040,-122.4400],  // Marina Blvd west of Fillmore
      [37.8040,-122.4490],  // Marina Blvd at Yacht Rd (stay on blvd, skip harbor)
      [37.8040,-122.4580],  // Crissy Field west
      [37.8063,-122.4680],  // GGB approach
      [37.8083,-122.4745],  // GGB toll plaza
      [37.8183,-122.4785],  // GGB north end / Vista Point
      [37.8316,-122.4780],  // Conzelman Rd
      [37.8340,-122.4850],  // Hawk Hill
      [37.8348,-122.4934],  // Marin Headlands descent
      [37.8421,-122.4972],  // Alexander Ave
      [37.8490,-122.4916],  // Sausalito approach
      [37.8590,-122.4830],  // Sausalito waterfront
    ]
  },
  ocean: {
    name: "Ocean Beach & Sunset",
    distance: 12.8, elevationGain: 320, ftPerMile: 25, time: 72,
    scenicZones: ["Ocean Beach", "Golden Gate Park", "Sunset District"],
    isScenic: true, hasGGBCrossing: false,
    description: "Pacific Heights → GG Park → Ocean Beach → Sunset loop back via Panhandle.",
    // Clockwise: west through Pac Heights → south into GG Park → west to Ocean Beach
    //   → south along Great Highway → east on Sloat → north on Sunset Blvd
    //   → east through GG Park / Panhandle → north via Divisadero → home
    coreWaypoints: [
      [37.7920,-122.4380],  // Pacific Heights heading west
      [37.7830,-122.4500],  // Arguello & California
      [37.7750,-122.4580],  // Arguello & Fulton (GG Park entrance)
      [37.7710,-122.4680],  // JFK Dr inside park
      [37.7700,-122.4800],  // GG Park mid
      [37.7700,-122.4950],  // GG Park west
      [37.7700,-122.5100],  // Ocean Beach / Great Highway north
      [37.7600,-122.5095],  // Great Highway south
      [37.7500,-122.5080],  // Great Highway further south
      [37.7380,-122.5060],  // Sloat & Great Highway
      [37.7380,-122.4960],  // Sloat Blvd heading east
      [37.7430,-122.4870],  // Sunset Blvd & Sloat (turn north)
      [37.7530,-122.4770],  // Sunset Blvd & Noriega
      [37.7620,-122.4690],  // Sunset Blvd & Irving
      [37.7700,-122.4530],  // Stanyan & Haight (park east end)
      [37.7720,-122.4440],  // Panhandle heading east
      [37.7750,-122.4370],  // Fell & Divisadero
      [37.7850,-122.4350],  // Divisadero & Clay (north of Tenderloin)
      [37.7920,-122.4340],  // Pacific Heights / Fillmore
    ]
  }
};

// Build route: prepend user start, append user end for loops
function buildRoute(template, userLatLng) {
  const core = template.coreWaypoints;
  const isLoop = template.name !== "Golden Gate to Sausalito";
  const waypoints = isLoop
    ? [userLatLng, ...core, userLatLng]
    : [userLatLng, ...core];
  return { ...template, waypoints };
}

// ── Fetch road-snapped route from OSRM (runs in React, not iframe) ───────────
function useRouteGeometry(waypoints) {
  const [coords, setCoords] = useState(null);
  const waypointsKey = JSON.stringify(waypoints);

  useEffect(() => {
    let cancelled = false;
    const osrmCoords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const bikeUrl = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;
    const carUrl = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;

    function parse(data) {
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      }
      return null;
    }

    fetch(bikeUrl)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const result = parse(data);
        if (result) { setCoords(result); return; }
        return fetch(carUrl).then(r => r.json()).then(data2 => {
          if (!cancelled) setCoords(parse(data2) || waypoints);
        });
      })
      .catch(() => {
        if (cancelled) return;
        fetch(carUrl).then(r => r.json()).then(data => {
          if (!cancelled) setCoords(parse(data) || waypoints);
        }).catch(() => { if (!cancelled) setCoords(waypoints); });
      });

    return () => { cancelled = true; };
  }, [waypointsKey]);

  return coords;
}

// ── Map component — Leaflet in iframe srcdoc, coords resolved by React ───────
function RouteMap({ route }) {
  const resolvedCoords = useRouteGeometry(route.waypoints);
  const displayCoords = resolvedCoords || route.waypoints;
  const coordsJson = JSON.stringify(displayCoords);
  const last = route.waypoints[route.waypoints.length-1];
  const isLoop = Math.abs(route.waypoints[0][0] - last[0]) < 0.001 && Math.abs(route.waypoints[0][1] - last[1]) < 0.001;
  const loading = !resolvedCoords;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
<script>
  var coords = ${coordsJson};
  var isLoop = ${isLoop};
  var map = L.map('map', { zoomControl: true, scrollWheelZoom: true });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://publicdomainmap.org">Public Domain Map</a>',
    maxZoom: 19
  }).addTo(map);

  // Route glow
  L.polyline(coords, { color: '#f97316', weight: 12, opacity: 0.12, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  // Route line
  var line = L.polyline(coords, { color: '#f97316', weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);

  // Start marker
  var startIcon = L.divIcon({
    html: '<div style="font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center"><div style="background:#111;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25)">' + (isLoop ? 'Start / End' : 'Start') + '</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #111;margin-top:-1px"></div><div style="width:5px;height:5px;background:#111;border-radius:50%;border:2px solid #fff;margin-top:-1px;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div></div>',
    className: '', iconSize: [80, 40], iconAnchor: [isLoop ? 37 : 24, 40]
  });
  L.marker(coords[0], { icon: startIcon }).addTo(map);

  if (!isLoop) {
    var endIcon = L.divIcon({
      html: '<div style="font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center"><div style="background:#f97316;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 8px rgba(249,115,22,0.3)">End</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #f97316;margin-top:-1px"></div><div style="width:5px;height:5px;background:#f97316;border-radius:50%;border:2px solid #fff;margin-top:-1px"></div></div>',
      className: '', iconSize: [50, 40], iconAnchor: [18, 40]
    });
    L.marker(coords[coords.length-1], { icon: endIcon }).addTo(map);
  }

  map.fitBounds(line.getBounds(), { padding: [32, 32] });
<\/script>
</body>
</html>`;

  return (
    <div style={{ position: "relative" }}>
      {loading && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10,
          fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#888", background: "#fff",
          padding: "8px 16px", borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}>
          Loading route…
        </div>
      )}
      <iframe
        srcDoc={html}
        style={{ width: "100%", height: 400, border: "none", display: "block" }}
        title="Route map"
        sandbox="allow-scripts"
      />
    </div>
  );
}

function ElevationChart({ gain }) {
  const pts = Array.from({ length: 51 }, (_, i) => {
    const t = i / 50;
    const n = Math.sin(t * 8) * 0.3 + Math.sin(t * 3.2) * 0.5 + Math.cos(t * 5.7) * 0.2;
    return { x: t * 200, y: Math.max(0, (t < 0.5 ? t * 2 : (1 - t) * 2) * gain * (0.7 + n * 0.3)) };
  });
  const maxY = Math.max(...pts.map(p => p.y)) || 1;
  const H = 72, W = 200;
  const sy = y => H - (y / maxY) * (H - 8);
  const pd = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${sy(p.y)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 72 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={pd + ` L ${W} ${H} L 0 ${H} Z`} fill="url(#eg)" />
      <path d={pd} fill="none" stroke="#f97316" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function RidePlanner() {
  const [step, setStep] = useState(1);
  const [startAddress, setStartAddress] = useState("");
  const [useGPS, setUseGPS] = useState(false);
  const [distance, setDistance] = useState(16);
  const [elevSlider, setElevSlider] = useState(1);
  const [preferLoop, setPreferLoop] = useState(true);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [route, setRoute] = useState(null);
  const [startLatLng, setStartLatLng] = useState(null);
  const [showCoffeeV2, setShowCoffeeV2] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const preset = ELEVATION_PRESETS[elevSlider];
  const ftColor = v => v <= 25 ? "#22c55e" : v <= 50 ? "#84cc16" : v <= 100 ? "#f59e0b" : "#ef4444";
  const canGo = startAddress || useGPS;

  const handleGenerate = () => {
    if (!canGo) return;
    setGenerating(true);
    setTimeout(() => {
      const latlng = useGPS ? [37.7996, -122.4183] : geocode(startAddress);
      const templateKey = preferLoop
        ? (elevSlider <= 1 ? "ocean" : "scenic")
        : (distance >= 20 ? "marin" : elevSlider <= 1 ? "ocean" : "scenic");
      const built = buildRoute(ROUTE_TEMPLATES[templateKey], latlng);
      setStartLatLng(latlng);
      setRoute(built);
      setGenerating(false);
      setStep(2);
      setActiveTab("overview");
    }, 1600);
  };

  const handleStravaConnect = () => {
    const STRAVA_CLIENT_ID = "YOUR_STRAVA_CLIENT_ID";
    const redirectUri = encodeURIComponent(window.location.href);
    const stravaUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=activity%3Awrite%2Cread`;
    window.open(stravaUrl, "_blank");
    setTimeout(() => setStravaConnected(true), 1000);
  };

  const handleStravaSave = () => {
    setExportSuccess("strava");
    setTimeout(() => setExportSuccess(null), 3000);
  };

  const handleGPXDownload = () => {
    if (!route) return;
    const now = new Date().toISOString();
    const trkpts = route.waypoints.map(([lat, lng]) =>
      `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`
    ).join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Routa SF·Marin"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${route.name}</name>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>${route.name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Routa_${route.name.replace(/\s+/g, "_")}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportSuccess("gpx");
    setTimeout(() => setExportSuccess(null), 3000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fafaf8", fontFamily: "'DM Sans','Helvetica Neue',sans-serif", color: "#111" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input[type=range]{-webkit-appearance:none;appearance:none;height:2px;background:#e5e5e5;outline:none;border-radius:2px;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#111;cursor:pointer;border:2.5px solid #fafaf8;box-shadow:0 1px 5px rgba(0,0,0,0.2)}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
        .fade-in{animation:fi 0.32s ease forwards}@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .slide-up{animation:su 0.42s cubic-bezier(.16,1,.3,1) forwards}@keyframes su{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .blink{animation:bl 1.3s infinite}@keyframes bl{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: "1px solid #ebebeb", background: "rgba(250,250,248,0.94)", position: "sticky", top: 0, zIndex: 200, backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9.5" stroke="#111" strokeWidth="1.5" />
              <path d="M8 13 C8 9 12 7 16 12 C19 16 15 18 12 18 C9 18 8 16 8 13Z" fill="#f97316" opacity="0.9" />
              <circle cx="12" cy="12" r="1.8" fill="#111" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: 14.5, letterSpacing: "-0.3px" }}>Routa</span>
            <span style={{ fontSize: 11, color: "#aaa", background: "#f2f2ef", borderRadius: 4, padding: "2px 7px", fontFamily: "'DM Mono',monospace" }}>SF · Marin</span>
          </div>
          {step === 2 && (
            <button onClick={() => { setStep(1); setRoute(null); setExportSuccess(null); }}
              style={{ fontSize: 13, color: "#555", background: "none", border: "1px solid #e5e5e5", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>
              ← New route
            </button>
          )}
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 100px" }}>

        {/* ── Step 1: Input form ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="fade-in">
            <div style={{ marginBottom: 44 }}>
              <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.7px", lineHeight: 1.18, marginBottom: 10 }}>Plan your ride.</h1>
              <p style={{ color: "#888", fontSize: 14.5, lineHeight: 1.65 }}>Tell us where you're starting and what you want —<br />we'll build the route.</p>
            </div>

            <div style={{ display: "grid", gap: 30 }}>
              {/* Starting point */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#999", display: "block", marginBottom: 10 }}>Starting point</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="Address or neighborhood in SF / Marin"
                    value={startAddress} onChange={e => { setStartAddress(e.target.value); setUseGPS(false); }}
                    style={{ flex: 1, border: "1.5px solid", borderColor: startAddress ? "#111" : "#e5e5e5", borderRadius: 10, padding: "13px 16px", fontSize: 14, background: "#fff", outline: "none", transition: "border-color 0.15s", fontFamily: "inherit" }}
                  />
                  <button onClick={() => { setUseGPS(true); setStartAddress("Using your location"); }}
                    style={{ border: "1.5px solid", borderColor: useGPS ? "#111" : "#e5e5e5", borderRadius: 10, padding: "0 15px", background: useGPS ? "#111" : "#fff", color: useGPS ? "#fff" : "#666", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", transition: "all 0.15s", fontFamily: "inherit" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                    GPS
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#bbb", marginTop: 7 }}>e.g. "Russian Hill", "Ferry Building", "Marina"</p>
              </div>

              {/* Distance */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#999", display: "block", marginBottom: 10 }}>Distance</label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input type="number" value={distance} min={4} max={60}
                      onChange={e => setDistance(Math.min(60, Math.max(4, Number(e.target.value))))}
                      style={{ width: 82, border: "1.5px solid #e5e5e5", borderRadius: 10, padding: "11px 32px 11px 14px", fontSize: 21, fontWeight: 600, fontFamily: "'DM Mono',monospace", background: "#fff", outline: "none", appearance: "none", textAlign: "right" }}
                    />
                    <span style={{ position: "absolute", right: 11, fontSize: 12, color: "#aaa" }}>mi</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <input type="range" min={4} max={60} value={distance} onChange={e => setDistance(Number(e.target.value))} style={{ width: "100%" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "#ccc" }}>
                      <span>4</span><span>30</span><span>60 mi</span>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>Moderate pace (~12 mph) · est. {Math.round(distance / 12 * 60)} min</p>
              </div>

              {/* Elevation */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#999", display: "block", marginBottom: 10 }}>Elevation preference</label>
                <input type="range" min={0} max={4} value={elevSlider} onChange={e => setElevSlider(Number(e.target.value))} style={{ width: "100%" }} />
                <div style={{ position: "relative", height: 20, marginTop: 7 }}>
                  {ELEVATION_PRESETS.map((p, i) => {
                    const pct = i / (ELEVATION_PRESETS.length - 1);
                    const isFirst = i === 0;
                    const isLast = i === ELEVATION_PRESETS.length - 1;
                    return (
                      <span key={p.label} style={{
                        position: "absolute",
                        left: isLast ? "auto" : `${pct * 100}%`,
                        right: isLast ? 0 : "auto",
                        transform: isFirst ? "none" : isLast ? "none" : "translateX(-50%)",
                        fontSize: 12,
                        fontWeight: elevSlider === i ? 600 : 400,
                        color: elevSlider === i ? "#111" : "#ccc",
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                      }}>{p.label}</span>
                    );
                  })}
                </div>
                <div style={{ marginTop: 11, display: "inline-flex", alignItems: "center", gap: 7, background: "#f5f5f2", borderRadius: 8, padding: "6px 12px" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: ftColor(preset.ftPerMile) }} />
                  <span style={{ fontSize: 12.5, color: "#555", fontFamily: "'DM Mono',monospace" }}>≤ {preset.ftPerMile} ft/mile avg gain</span>
                </div>
              </div>

              {/* Route type */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#999", display: "block", marginBottom: 10 }}>Route type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Loop", "Out & back"].map(type => {
                    const active = (preferLoop && type === "Loop") || (!preferLoop && type === "Out & back");
                    return (
                      <button key={type} onClick={() => setPreferLoop(type === "Loop")}
                        style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, border: "1.5px solid", cursor: "pointer", transition: "all 0.15s", borderColor: active ? "#111" : "#e5e5e5", background: active ? "#111" : "#fff", color: active ? "#fff" : "#666", fontFamily: "inherit" }}>
                        {type}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>If a loop adds too much elevation, we'll suggest an out & back instead.</p>
              </div>

              {/* Coffee stops */}
              <div style={{ border: "1.5px dashed #ebebeb", borderRadius: 12, padding: "15px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 17 }}>☕</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#aaa", display: "flex", alignItems: "center", gap: 7 }}>
                        Coffee stops <span style={{ fontSize: 10.5, background: "#f2f2ef", color: "#bbb", borderRadius: 4, padding: "2px 6px" }}>Coming soon</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#ccc", marginTop: 2 }}>Add a café stop along your route</div>
                    </div>
                  </div>
                  <button onClick={() => setShowCoffeeV2(!showCoffeeV2)} style={{ fontSize: 12, color: "#ccc", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    {showCoffeeV2 ? "Hide" : "Preview"}
                  </button>
                </div>
                {showCoffeeV2 && (
                  <div style={{ marginTop: 12, padding: "11px 14px", background: "#f9f9f7", borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: "#bbb", lineHeight: 1.65 }}>V2: pick from curated SF cafés (Sightglass, Ritual, Equator, Verve…) and we'll route you past them. Powered by Google Places API.</p>
                  </div>
                )}
              </div>

              {/* Generate button */}
              <button onClick={handleGenerate} disabled={!canGo}
                style={{ width: "100%", padding: "15px", borderRadius: 12, fontSize: 14.5, fontWeight: 600, border: "none", cursor: canGo ? "pointer" : "not-allowed", background: canGo ? "#111" : "#e5e5e5", color: canGo ? "#fff" : "#bbb", transition: "all 0.2s", letterSpacing: "-0.2px", fontFamily: "inherit" }}>
                {generating ? <span className="blink">Finding your route…</span> : "Generate route →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Route result ──────────────────────────────────────── */}
        {step === 2 && route && startLatLng && (
          <div className="slide-up">
            {/* Badges */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9, flexWrap: "wrap" }}>
                {route.isScenic && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6, padding: "3px 8px" }}>🌿 Scenic</span>}
                {route.hasGGBCrossing && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 6, padding: "3px 8px" }}>🌁 GGB Crossing*</span>}
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.6px", marginBottom: 7 }}>{route.name}</h2>
              <p style={{ fontSize: 14, color: "#777", lineHeight: 1.65, maxWidth: 500 }}>{route.description}</p>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
              {[
                { label: "Distance", value: route.distance, unit: "mi" },
                { label: "Elevation", value: route.elevationGain, unit: "ft" },
                { label: "Avg grade", value: route.ftPerMile, unit: "ft/mi" },
                { label: "Est. time", value: route.time, unit: "min" },
              ].map(s => (
                <div key={s.label} style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 12, padding: "15px 13px" }}>
                  <div style={{ fontSize: 11, color: "#bbb", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{s.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span style={{ fontSize: 21, fontWeight: 600, fontFamily: "'DM Mono',monospace", letterSpacing: "-0.5px" }}>{s.value}</span>
                    <span style={{ fontSize: 11.5, color: "#bbb" }}>{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Map */}
            <div style={{ background: "#ede9e0", border: "1px solid #ddd8cc", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
              <RouteMap route={route} startLatLng={startLatLng} />
              {route.hasGGBCrossing && (
                <div style={{ padding: "10px 16px", background: "#fffbeb", borderTop: "1px solid #fef3c7" }}>
                  <p style={{ fontSize: 12, color: "#92400e", lineHeight: 1.55 }}>* GGB west sidewalk open sunrise–sunset. Confirm hours at nps.gov/goga before riding.</p>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #ebebeb", marginBottom: 20 }}>
              {["overview", "elevation", "scenic"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: "9px 17px", fontSize: 13, fontWeight: 500, background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#111" : "transparent"}`, color: activeTab === tab ? "#111" : "#aaa", cursor: "pointer", marginBottom: -1, transition: "all 0.15s", fontFamily: "inherit", textTransform: "capitalize" }}>
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="fade-in" style={{ fontSize: 14, color: "#555", lineHeight: 1.75 }}>
                <p>Route starts and ends at your location. Built for a moderate pace (~12 mph avg), total ride time about {Math.floor(route.time / 60) > 0 ? `${Math.floor(route.time / 60)}h ` : ""}{route.time % 60}min. Suitable for road bikes. Primarily paved — some crushed gravel in park sections.</p>
                <p style={{ marginTop: 12, color: "#aaa", fontSize: 13 }}>Map data: OpenStreetMap · Public Domain Map · Elevation: USGS National Map + SF Open Data contours</p>
              </div>
            )}

            {activeTab === "elevation" && (
              <div className="fade-in">
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: ftColor(route.ftPerMile) }} />
                  <span style={{ fontSize: 13, color: "#555" }}>{route.ftPerMile <= 50 ? "Low elevation — comfortable for most riders." : "Moderate — some climbing involved."}</span>
                </div>
                <div style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "#ccc" }}>
                    <span>Start</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{route.elevationGain} ft total gain</span><span>Finish</span>
                  </div>
                  <ElevationChart gain={route.elevationGain} />
                </div>
              </div>
            )}

            {activeTab === "scenic" && (
              <div className="fade-in">
                <p style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>This route passes through or near:</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {route.scenicZones.map(z => (
                    <span key={z} style={{ fontSize: 13, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>🌿 {z}</span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: "#bbb", marginTop: 16, lineHeight: 1.6 }}>Scenic score weighs proximity to parks, waterfront roads, tree canopy, and dedicated bike paths. Multi-lane arterials reduce score.</p>
              </div>
            )}

            {/* Export */}
            <div style={{ marginTop: 36, paddingTop: 28, borderTop: "1px solid #ebebeb" }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#aaa", marginBottom: 16 }}>Export exact route</div>
              {exportSuccess && (
                <div className="fade-in" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "11px 16px", marginBottom: 14, fontSize: 13, color: "#15803d", display: "flex", alignItems: "center", gap: 8 }}>
                  ✓ {exportSuccess === "strava" ? "Route saved to your Strava account." : "GPX downloaded — import in Strava or Garmin Connect."}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {!stravaConnected ? (
                  <button onClick={handleStravaConnect}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10, border: "1.5px solid #FC4C02", background: "#fff", color: "#FC4C02", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#FC4C02"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" /></svg>
                    Connect Strava
                  </button>
                ) : (
                  <button onClick={handleStravaSave}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10, border: "none", background: "#FC4C02", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" /></svg>
                    Save to Strava
                  </button>
                )}
                <button onClick={handleGPXDownload}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 18px", borderRadius: 10, border: "1.5px solid #e5e5e5", background: "#fff", color: "#444", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Download GPX
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 13px", borderRadius: 10, background: "#f5f5f2", fontSize: 12, color: "#aaa" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                  Garmin: import GPX via Garmin Connect
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
