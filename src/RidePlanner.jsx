import { useState, useEffect } from "react";

const ELEVATION_PRESETS = [
  { label: "Mostly Flat", ftPerMile: 25 },
  { label: "Moderate", ftPerMile: 50 },
  { label: "Rolling", ftPerMile: 100 },
  { label: "Hilly", ftPerMile: 150 },
  { label: "Very Hilly", ftPerMile: 200 },
];

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const SF_MARIN_BBOX = [-122.55, 37.70, -122.34, 37.93];

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
  "mallorca way": [37.8004, -122.4388],
  "presidio":     [37.7989, -122.4662],
  "graham st":    [37.8005, -122.4567],
  "graham street": [37.8005, -122.4567],
  "sausalito":    [37.8590, -122.4852],
  "default":      [37.7996, -122.4183],
};

function parseLatLng(addr) {
  const match = addr.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function normalizeAddressInput(addr) {
  return String(addr || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[\r\n]+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function buildAddressSearchVariants(addr) {
  const normalized = normalizeAddressInput(addr);
  const streetLine = normalized.split(",")[0]?.trim() || normalized;
  const zip = normalized.match(/\b\d{5}\b/)?.[0];

  return [...new Set([
    normalized,
    normalized.replace(/,?\s*United States$/i, "").trim(),
    normalized.replace(/,?\s*San Francisco,\s*CA\s*\d{5}$/i, "").trim(),
    streetLine,
    [streetLine, zip].filter(Boolean).join(" "),
  ].filter(Boolean))];
}

function looksLikeStreetAddress(addr) {
  return /\b\d+\b/.test(addr);
}

async function searchMapboxCandidates(addr) {
  if (!MAPBOX_ACCESS_TOKEN) return [];

  const normalizedAddress = normalizeAddressInput(addr);
  const url = new URL(`https://api.mapbox.com/search/geocode/v6/forward`);
  url.searchParams.set("q", normalizedAddress);
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "US");
  url.searchParams.set("types", looksLikeStreetAddress(normalizedAddress) ? "address" : "address,street,neighborhood,place");
  url.searchParams.set("bbox", SF_MARIN_BBOX.join(","));

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Mapbox search failed");

  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features
    .filter((feature) => Array.isArray(feature?.geometry?.coordinates))
    .map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const label =
        feature.properties?.full_address ||
        feature.properties?.name_preferred ||
        feature.properties?.name ||
        feature.place_name ||
        normalizedAddress;

      return {
        lat,
        lng,
        label,
      };
    });
}

async function searchAddressCandidates(addr) {
  if (!addr) return [];
  const normalizedAddress = normalizeAddressInput(addr);
  const exactAddressMode = looksLikeStreetAddress(normalizedAddress);

  const parsedLatLng = parseLatLng(normalizedAddress);
  if (parsedLatLng) {
    return [{ lat: parsedLatLng[0], lng: parsedLatLng[1], label: `${parsedLatLng[0]}, ${parsedLatLng[1]}` }];
  }

  try {
    const mapboxCandidates = await searchMapboxCandidates(normalizedAddress);
    if (mapboxCandidates.length) {
      return mapboxCandidates;
    }
  } catch {
    // Fall back to local/API helpers if Mapbox is unavailable.
  }

  if (!exactAddressMode) {
    const l = normalizedAddress.toLowerCase();
    for (const [k, v] of Object.entries(SF_GEOCODES)) {
      if (l.includes(k)) {
        return [{ lat: v[0], lng: v[1], label: `${normalizedAddress} (local match)` }];
      }
    }
  }

  try {
    const url = new URL("/api/geocode", window.location.origin);
    for (const variant of buildAddressSearchVariants(normalizedAddress)) {
      url.searchParams.set("q", variant);
      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const result = await response.json();
      if (Array.isArray(result?.candidates) && result.candidates.length) return result.candidates;
      if (result?.best) return [result.best];
    }
  } catch {
    // Direct lookup fallback below.
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${normalizedAddress}, San Francisco or Marin County, California`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("viewbox", "-122.55,37.93,-122.34,37.70");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Direct geocoding request failed");
    const results = await response.json();
    if (Array.isArray(results)) {
      return results
        .filter((result) => result?.lat && result?.lon)
        .map((result) => ({
          lat: Number(result.lat),
          lng: Number(result.lon),
          label: result.display_name || normalizedAddress,
        }));
    }
  } catch {
    return [];
  }

  return [];
}

// ── Route segments ────────────────────────────────────────────────────────────
// Routes are assembled dynamically from corridor segments rather than picked
// from one fixed template. Segments are directional and chosen to keep forward
// progress on loops and a single legal turnaround on out-and-backs.
const ROUTE_SEGMENTS = {
  parkApproach: {
    distance: 2.4,
    scenicZones: ["Pacific Heights"],
    elevationProfile: [0, 18, 42, 36, 68, 92, 86, 122, 145],
    waypoints: [
      [37.7920,-122.4380],
      [37.7830,-122.4500],
      [37.7750,-122.4580],
    ],
  },
  parkInnerReturn: {
    distance: 2.0,
    scenicZones: ["Golden Gate Park"],
    elevationProfile: [0, 6, -4, -12, -18, -24, -30],
    waypoints: [
      [37.7710,-122.4680],
      [37.7700,-122.4600],
      [37.7700,-122.4530],
    ],
  },
  parkToOceanWest: {
    distance: 3.1,
    scenicZones: ["Golden Gate Park", "Ocean Beach"],
    elevationProfile: [0, 8, -6, -18, -32, -28, -44, -60, -74, -85],
    waypoints: [
      [37.7710,-122.4680],
      [37.7700,-122.4800],
      [37.7700,-122.4950],
      [37.7700,-122.5100],
    ],
  },
  oceanSouthReturn: {
    distance: 5.3,
    scenicZones: ["Ocean Beach", "Sunset District"],
    elevationProfile: [0, -6, -12, -4, 6, 18, 30, 24, 40, 54, 48, 66, 82],
    waypoints: [
      [37.7600,-122.5095],
      [37.7500,-122.5080],
      [37.7380,-122.5060],
      [37.7380,-122.4960],
      [37.7430,-122.4870],
      [37.7530,-122.4770],
      [37.7620,-122.4690],
      [37.7700,-122.4530],
    ],
  },
  panhandleHome: {
    distance: 2.2,
    scenicZones: ["Panhandle"],
    elevationProfile: [0, -10, -22, -18, -34, -48, -44, -60, -70],
    waypoints: [
      [37.7720,-122.4440],
      [37.7750,-122.4370],
      [37.7850,-122.4350],
      [37.7920,-122.4340],
    ],
  },
  marinaApproach: {
    distance: 2.5,
    scenicZones: ["Marina District", "Crissy Field"],
    elevationProfile: [0, 4, 9, 7, 13, 18, 16, 21, 24],
    waypoints: [
      [37.8005,-122.4365],
      [37.8038,-122.4400],
      [37.8040,-122.4460],
      [37.8040,-122.4525],
      [37.8038,-122.4578],
    ],
  },
  presidioCoastal: {
    distance: 4.5,
    scenicZones: ["Crissy Field", "Presidio", "Baker Beach"],
    elevationProfile: [0, 22, 48, 72, 62, 95, 118, 108, 138, 160, 175, 158, 142, 120],
    waypoints: [
      [37.8012,-122.4590],
      [37.7994,-122.4608],
      [37.7968,-122.4643],
      [37.7945,-122.4680],
      [37.7922,-122.4725],
      [37.7880,-122.4830],
      [37.7830,-122.4840],
    ],
  },
  parkFromBaker: {
    distance: 2.0,
    scenicZones: ["Golden Gate Park"],
    elevationProfile: [0, -14, -30, -24, -38, -50],
    waypoints: [
      [37.7740,-122.4770],
      [37.7710,-122.4680],
      [37.7700,-122.4530],
    ],
  },
  parkToOceanFromBaker: {
    distance: 3.5,
    scenicZones: ["Golden Gate Park", "Ocean Beach"],
    elevationProfile: [0, -10, -24, -36, -30, -46, -58],
    waypoints: [
      [37.7740,-122.4770],
      [37.7700,-122.4950],
      [37.7700,-122.5100],
    ],
  },
  bridgeConnector: {
    distance: 1.2,
    scenicZones: ["Crissy Field"],
    elevationProfile: [0, 18, 44, 68, 92, 125],
    waypoints: [
      [37.8048,-122.4635],
      [37.8063,-122.4680],
      [37.8083,-122.4745],
    ],
  },
  bridgeVista: {
    distance: 2.8,
    scenicZones: ["Golden Gate Bridge"],
    elevationProfile: [0, 12, 24, 38, 52, 68, 85],
    waypoints: [
      [37.8183,-122.4785],
    ],
  },
  hawkHillClimb: {
    distance: 3.2,
    scenicZones: ["Golden Gate Bridge", "Marin Headlands"],
    elevationProfile: [0, 28, 64, 98, 122, 148, 176, 204, 232, 255],
    waypoints: [
      [37.8183,-122.4785],
      [37.8316,-122.4780],
      [37.8340,-122.4850],
    ],
  },
  headlandsDescent: {
    distance: 3.9,
    scenicZones: ["Marin Headlands", "Sausalito Waterfront"],
    elevationProfile: [0, -18, -42, -74, -108, -136, -126, -170, -208, -236, -260, -295],
    waypoints: [
      [37.8348,-122.4934],
      [37.8421,-122.4972],
      [37.8490,-122.4916],
      [37.8590,-122.4830],
    ],
  },
  headlandsTurnaround: {
    distance: 2.2,
    scenicZones: ["Marin Headlands"],
    elevationProfile: [0, -16, -38, -62, -86, -110],
    waypoints: [
      [37.8348,-122.4934],
      [37.8421,-122.4972],
    ],
  },
};

const STRAVA_MESSAGES = {
  connected: "Strava connected. You can now send this route to your account.",
  denied: "Strava authorization was canceled.",
  invalid_state: "The Strava login session expired. Try connecting again.",
  exchange_failed: "Strava login completed, but Routa could not finish the token exchange.",
};

function roundToNearest(value, step = 1) {
  return Math.round(value / step) * step;
}

function isSamePoint(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function concatSegmentWaypoints(segmentIds) {
  return segmentIds.flatMap((segmentId, index) => {
    const segment = ROUTE_SEGMENTS[segmentId];
    if (!segment) return [];
    if (index === 0) return segment.waypoints;

    return isSamePoint(segment.waypoints[0], ROUTE_SEGMENTS[segmentIds[index - 1]]?.waypoints.at(-1))
      ? segment.waypoints.slice(1)
      : segment.waypoints;
  });
}

function collectScenicZones(segmentIds) {
  return [...new Set(segmentIds.flatMap((segmentId) => ROUTE_SEGMENTS[segmentId]?.scenicZones || []))];
}

function totalSegmentDistance(segmentIds) {
  return Number(segmentIds.reduce((total, segmentId) => total + (ROUTE_SEGMENTS[segmentId]?.distance || 0), 0).toFixed(1));
}

function concatSegmentElevationProfile(segmentIds) {
  let currentElevation = 0;

  return segmentIds.flatMap((segmentId, index) => {
    const segment = ROUTE_SEGMENTS[segmentId];
    if (!segment) return [];

    const profile = segment.elevationProfile || [0];
    const adjusted = profile.map((point) => currentElevation + point);
    currentElevation = adjusted.at(-1) ?? currentElevation;

    return index === 0 ? adjusted : adjusted.slice(1);
  });
}

function computeElevationGainFromProfile(profile) {
  let totalGain = 0;
  for (let i = 1; i < profile.length; i += 1) {
    totalGain += Math.max(0, profile[i] - profile[i - 1]);
  }
  return totalGain;
}

function scaleElevationProfile(profile, targetGain) {
  if (!Array.isArray(profile) || profile.length < 2) return [0, targetGain || 0];

  const rawGain = computeElevationGainFromProfile(profile);
  if (rawGain <= 0 || targetGain <= 0) return profile;

  const scale = targetGain / rawGain;
  const scaled = [profile[0]];

  for (let i = 1; i < profile.length; i += 1) {
    const nextValue = scaled[i - 1] + (profile[i] - profile[i - 1]) * scale;
    scaled.push(nextValue);
  }

  return scaled;
}

function buildLoopElevationProfile(segmentIds, targetGain) {
  return scaleElevationProfile(concatSegmentElevationProfile(segmentIds), targetGain);
}

function buildOutAndBackElevationProfile(outboundSegmentIds, turnaroundSegmentIds, targetGain) {
  const outboundProfile = concatSegmentElevationProfile([...outboundSegmentIds, ...turnaroundSegmentIds]);
  const mirroredReturn = outboundProfile.slice(0, -1).reverse();
  return scaleElevationProfile([...outboundProfile, ...mirroredReturn], targetGain);
}

function createLoopCandidate({
  id,
  name,
  description,
  segmentIds,
  requestedFtPerMile,
}) {
  const distance = totalSegmentDistance(segmentIds);
  const scenicZones = collectScenicZones(segmentIds);
  const baseFtPerMile = scenicZones.includes("Baker Beach") ? 42 : scenicZones.includes("Ocean Beach") ? 25 : 32;
  const ftPerMile = Math.min(baseFtPerMile, requestedFtPerMile);
  const elevationGain = roundToNearest(distance * ftPerMile, 10);
  const time = Math.round(distance / 12 * 60);

  return {
    id,
    name,
    description,
    routeKind: "loop",
    allowsTurnaroundUTurn: false,
    isOutAndBack: false,
    isLoop: true,
    isScenic: true,
    hasGGBCrossing: false,
    scenicZones,
    distance,
    ftPerMile,
    elevationGain,
    elevationProfile: buildLoopElevationProfile(segmentIds, elevationGain),
    time,
    waypoints: concatSegmentWaypoints(segmentIds),
  };
}

function createOutAndBackCandidate({
  id,
  name,
  description,
  outboundSegmentIds,
  turnaroundSegmentIds,
  requestedFtPerMile,
}) {
  const outboundSegments = [...outboundSegmentIds, ...turnaroundSegmentIds];
  const outboundWaypoints = concatSegmentWaypoints(outboundSegments);
  const returnWaypoints = outboundWaypoints.slice(0, -1).reverse();
  const scenicZones = collectScenicZones(outboundSegments);
  const distance = Number((totalSegmentDistance(outboundSegments) * 2).toFixed(1));
  const ftPerMile = Math.min(40, requestedFtPerMile);
  const elevationGain = roundToNearest(distance * ftPerMile, 10);
  const time = Math.round(distance / 12 * 60);

  return {
    id,
    name,
    description,
    routeKind: "out-and-back",
    allowsTurnaroundUTurn: true,
    isOutAndBack: true,
    isLoop: true,
    isScenic: true,
    hasGGBCrossing: true,
    scenicZones,
    distance,
    ftPerMile,
    elevationGain,
    elevationProfile: buildOutAndBackElevationProfile(outboundSegmentIds, turnaroundSegmentIds, elevationGain),
    time,
    waypoints: [...outboundWaypoints, ...returnWaypoints],
  };
}

function buildDynamicCandidates(requestedFtPerMile) {
  const loopCandidates = [
    createLoopCandidate({
      id: "park-loop",
      name: "Golden Gate Park Loop",
      description: "Pacific Heights → Golden Gate Park → Panhandle loop.",
      segmentIds: ["parkApproach", "parkInnerReturn", "panhandleHome"],
      requestedFtPerMile,
    }),
    createLoopCandidate({
      id: "ocean-loop",
      name: "Ocean Beach & Sunset",
      description: "Pacific Heights → GG Park → Ocean Beach → Sunset loop back via Panhandle.",
      segmentIds: ["parkApproach", "parkToOceanWest", "oceanSouthReturn", "panhandleHome"],
      requestedFtPerMile,
    }),
    createLoopCandidate({
      id: "scenic-loop",
      name: "Golden Gate Loop",
      description: "Crissy Field → Presidio → Baker Beach → Golden Gate Park → Panhandle loop.",
      segmentIds: ["marinaApproach", "presidioCoastal", "parkFromBaker", "panhandleHome"],
      requestedFtPerMile,
    }),
    createLoopCandidate({
      id: "coastal-grand-loop",
      name: "Coastal Grand Loop",
      description: "Marina → Presidio → Baker Beach → Ocean Beach → Sunset → Panhandle loop.",
      segmentIds: ["marinaApproach", "presidioCoastal", "parkToOceanFromBaker", "oceanSouthReturn", "panhandleHome"],
      requestedFtPerMile,
    }),
  ];

  const outAndBackCandidates = [
    createOutAndBackCandidate({
      id: "bridge-outback",
      name: "Golden Gate Bridge Out & Back",
      description: "Ride out to the Golden Gate Bridge overlook, then return on the same corridor.",
      outboundSegmentIds: ["marinaApproach", "bridgeConnector"],
      turnaroundSegmentIds: ["bridgeVista"],
      requestedFtPerMile,
    }),
    createOutAndBackCandidate({
      id: "hawk-hill-outback",
      name: "Hawk Hill Out & Back",
      description: "Cross the bridge, climb Hawk Hill, then return along the same route.",
      outboundSegmentIds: ["marinaApproach", "bridgeConnector"],
      turnaroundSegmentIds: ["bridgeVista", "hawkHillClimb"],
      requestedFtPerMile,
    }),
    createOutAndBackCandidate({
      id: "sausalito-outback",
      name: "Sausalito Out & Back",
      description: "Cross the Golden Gate Bridge and continue into Sausalito before turning around.",
      outboundSegmentIds: ["marinaApproach", "bridgeConnector"],
      turnaroundSegmentIds: ["bridgeVista", "hawkHillClimb", "headlandsDescent"],
      requestedFtPerMile,
    }),
    createOutAndBackCandidate({
      id: "headlands-outback",
      name: "Marin Headlands Out & Back",
      description: "Cross the bridge, descend into the headlands, then turn around before Sausalito.",
      outboundSegmentIds: ["marinaApproach", "bridgeConnector"],
      turnaroundSegmentIds: ["bridgeVista", "hawkHillClimb", "headlandsTurnaround"],
      requestedFtPerMile,
    }),
  ];

  return [...loopCandidates, ...outAndBackCandidates];
}

function selectBestDynamicRoute(requestedDistance, requestedFtPerMile, preferLoop) {
  const preferredRouteKind = preferLoop ? "loop" : "out-and-back";
  const candidates = buildDynamicCandidates(requestedFtPerMile).map((candidate) => {
    const distancePenalty = Math.abs(candidate.distance - requestedDistance);
    const elevationPenalty = candidate.ftPerMile > requestedFtPerMile
      ? (candidate.ftPerMile - requestedFtPerMile) / 25
      : 0;
    const routeTypePenalty = candidate.routeKind === preferredRouteKind ? 0 : 1.5;

    return {
      candidate,
      distancePenalty,
      score: distancePenalty + elevationPenalty + routeTypePenalty,
    };
  });

  const bestPreferred = candidates
    .filter(({ candidate }) => candidate.routeKind === preferredRouteKind)
    .sort((a, b) => a.score - b.score)[0];

  if (bestPreferred && bestPreferred.distancePenalty <= 2) {
    return { ...bestPreferred.candidate, routeTypeAdjusted: false };
  }

  const bestWithinTolerance = candidates
    .filter(({ distancePenalty }) => distancePenalty <= 2)
    .sort((a, b) => a.score - b.score)[0];

  if (bestWithinTolerance) {
    return {
      ...bestWithinTolerance.candidate,
      routeTypeAdjusted: bestWithinTolerance.candidate.routeKind !== preferredRouteKind,
    };
  }

  const bestOverall = [...candidates].sort((a, b) => a.score - b.score)[0];
  return {
    ...bestOverall.candidate,
    routeTypeAdjusted: bestOverall.candidate.routeKind !== preferredRouteKind,
  };
}

function buildRoute(routeDefinition, userLatLng, requestedDistance) {
  const waypoints = routeDefinition.isLoop
    ? [userLatLng, ...routeDefinition.waypoints, userLatLng]
    : [userLatLng, ...routeDefinition.waypoints];

  return {
    ...routeDefinition,
    requestedDistance,
    distanceDelta: Number((routeDefinition.distance - requestedDistance).toFixed(1)),
    waypoints,
  };
}

function distanceBetweenMeters([lat1, lng1], [lat2, lng2]) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

function bearingVector(from, to) {
  return [to[0] - from[0], to[1] - from[1]];
}

function dotProduct([ax, ay], [bx, by]) {
  return ax * bx + ay * by;
}

function magnitude([x, y]) {
  return Math.hypot(x, y);
}

function totalPathDistanceMeters(coords, startIndex, endIndex) {
  let total = 0;
  for (let i = startIndex; i < endIndex; i += 1) {
    total += distanceBetweenMeters(coords[i], coords[i + 1]);
  }
  return total;
}

function findTurnaroundIndex(coords) {
  if (coords.length < 3) return -1;
  const start = coords[0];
  let turnaroundIndex = -1;
  let maxDistance = 0;

  for (let i = 1; i < coords.length - 1; i += 1) {
    const distance = distanceBetweenMeters(start, coords[i]);
    if (distance > maxDistance) {
      maxDistance = distance;
      turnaroundIndex = i;
    }
  }

  return turnaroundIndex;
}

function cleanupBacktracks(coords, allowTurnaroundUTurn = false) {
  if (!Array.isArray(coords) || coords.length < 7) return coords;

  const rejoinDistanceMeters = 45;
  const minSpurDistanceMeters = 110;
  const minOffsetMeters = 40;
  const turnaroundIndex = allowTurnaroundUTurn ? findTurnaroundIndex(coords) : -1;
  const turnaroundWindow = 12;

  let nextCoords = coords.slice();
  let removedSegment = true;
  let iterations = 0;

  while (removedSegment && iterations < 8) {
    removedSegment = false;
    iterations += 1;

    for (let start = 0; start < nextCoords.length - 5 && !removedSegment; start += 1) {
      for (let end = start + 4; end < Math.min(nextCoords.length, start + 80); end += 1) {
        if (
          turnaroundIndex >= 0 &&
          start <= turnaroundIndex + turnaroundWindow &&
          end >= turnaroundIndex - turnaroundWindow
        ) {
          continue;
        }

        const rejoinDistance = distanceBetweenMeters(nextCoords[start], nextCoords[end]);
        if (rejoinDistance > rejoinDistanceMeters) continue;

        const spurDistance = totalPathDistanceMeters(nextCoords, start, end);
        if (spurDistance < minSpurDistanceMeters) continue;

        let maxOffset = 0;
        for (let i = start + 1; i < end; i += 1) {
          maxOffset = Math.max(
            maxOffset,
            distanceBetweenMeters(nextCoords[start], nextCoords[i]),
            distanceBetweenMeters(nextCoords[end], nextCoords[i]),
          );
        }
        if (maxOffset < minOffsetMeters) continue;

        const outbound = bearingVector(nextCoords[start], nextCoords[start + 1]);
        const inbound = bearingVector(nextCoords[end - 1], nextCoords[end]);
        const denominator = magnitude(outbound) * magnitude(inbound);
        if (!denominator) continue;

        const alignment = dotProduct(outbound, inbound) / denominator;
        if (alignment > -0.2) continue;

        nextCoords = [
          ...nextCoords.slice(0, start + 1),
          ...nextCoords.slice(end),
        ];
        removedSegment = true;
        break;
      }
    }
  }

  return nextCoords;
}

// ── Fetch road-snapped route from OSRM (runs in React, not iframe) ───────────
function useRouteGeometry(route) {
  const [coords, setCoords] = useState(null);
  const routeKey = JSON.stringify(route);

  useEffect(() => {
    let cancelled = false;
    const parsedRoute = JSON.parse(routeKey);
    const parsedWaypoints = parsedRoute.waypoints;
    const osrmCoords = parsedWaypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const bikeUrl = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;
    const carUrl = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;
    const finalize = (geometry) => {
      const coords = geometry || parsedWaypoints;
      if (parsedRoute.isOutAndBack) return coords;
      return cleanupBacktracks(coords, Boolean(parsedRoute.allowsTurnaroundUTurn));
    };

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
        if (result) { setCoords(finalize(result)); return; }
        return fetch(carUrl).then(r => r.json()).then(data2 => {
          if (!cancelled) setCoords(finalize(parse(data2)));
        });
      })
      .catch(() => {
        if (cancelled) return;
        fetch(carUrl).then(r => r.json()).then(data => {
          if (!cancelled) setCoords(finalize(parse(data)));
        }).catch(() => { if (!cancelled) setCoords(finalize(null)); });
      });

    return () => { cancelled = true; };
  }, [routeKey]);

  return coords;
}

// ── Map component — Leaflet in iframe srcdoc, coords resolved by React ───────
function RouteMap({ route, startLatLng, onGeometryResolved }) {
  const resolvedCoords = useRouteGeometry(route);
  const displayCoords = resolvedCoords || route.waypoints;
  const coordsJson = JSON.stringify(displayCoords);
  const last = route.waypoints[route.waypoints.length-1];
  const isLoop = Math.abs(route.waypoints[0][0] - last[0]) < 0.001 && Math.abs(route.waypoints[0][1] - last[1]) < 0.001;
  const loading = !resolvedCoords;
  const markerStart = startLatLng || displayCoords[0];
  const markerEnd = isLoop ? markerStart : displayCoords[displayCoords.length - 1];

  useEffect(() => {
    onGeometryResolved?.(displayCoords);
  }, [displayCoords, onGeometryResolved]);

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
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></${"script"}>
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
  L.marker(${JSON.stringify(markerStart)}, { icon: startIcon }).addTo(map);

  if (!isLoop) {
    var endIcon = L.divIcon({
      html: '<div style="font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center"><div style="background:#f97316;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 8px rgba(249,115,22,0.3)">End</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #f97316;margin-top:-1px"></div><div style="width:5px;height:5px;background:#f97316;border-radius:50%;border:2px solid #fff;margin-top:-1px"></div></div>',
      className: '', iconSize: [50, 40], iconAnchor: [18, 40]
    });
    L.marker(${JSON.stringify(markerEnd)}, { icon: endIcon }).addTo(map);
  }

  map.fitBounds(line.getBounds(), { padding: [32, 32] });
</${"script"}>
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
        style={{ width: "100%", height: "clamp(280px, 52vh, 400px)", border: "none", display: "block" }}
        title="Route map"
        sandbox="allow-scripts"
      />
    </div>
  );
}

function ElevationChart({ profile, distance }) {
  const safeProfile = Array.isArray(profile) && profile.length > 1 ? profile : [0, 0];
  const minElevation = Math.min(...safeProfile);
  const normalizedProfile = safeProfile.map((point) => point - minElevation);
  const maxY = Math.max(...normalizedProfile) || 1;
  const outerWidth = 1200;
  const outerHeight = 160;
  const margin = { top: 12, right: 20, bottom: 34, left: 64 };
  const chartWidth = outerWidth - margin.left - margin.right;
  const chartHeight = outerHeight - margin.top - margin.bottom;
  const sy = (y) => margin.top + chartHeight - (y / maxY) * chartHeight;
  const sx = (index) => margin.left + (index / Math.max(normalizedProfile.length - 1, 1)) * chartWidth;
  const pts = normalizedProfile.map((point, index) => ({
    x: sx(index),
    y: point,
  }));
  const pd = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${sy(p.y)}`).join(" ");
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio, index, allTicks) => ({
    x: margin.left + ratio * chartWidth,
    textAnchor: index === 0 ? "start" : index === allTicks.length - 1 ? "end" : "middle",
    label: `${Math.round((distance || 0) * ratio)} mi`,
  }));
  const yTicks = [0, 0.5, 1].map((ratio) => {
    const value = Math.round(maxY * ratio);
    return {
      y: sy(value),
      label: `${value} ft`,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${outerWidth} ${outerHeight}`}
      style={{ width: "100%", height: 160, display: "block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {yTicks.map((tick) => (
        <g key={tick.label}>
          <line x1={margin.left} x2={outerWidth - margin.right} y1={tick.y} y2={tick.y} stroke="#f1f1f1" strokeWidth="1" />
          <text x={margin.left - 10} y={tick.y + 4} textAnchor="end" fontSize="8" fill="#a3a3a3" fontFamily="'DM Sans', 'Helvetica Neue', sans-serif">
            {tick.label}
          </text>
        </g>
      ))}
      <line x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + chartHeight} stroke="#d6d3d1" strokeWidth="1" />
      <line x1={margin.left} x2={outerWidth - margin.right} y1={margin.top + chartHeight} y2={margin.top + chartHeight} stroke="#d6d3d1" strokeWidth="1" />
      {xTicks.map((tick) => (
        <g key={tick.label}>
          <line x1={tick.x} x2={tick.x} y1={margin.top + chartHeight} y2={margin.top + chartHeight + 4} stroke="#d6d3d1" strokeWidth="1" />
          <text x={tick.x} y={outerHeight - 8} textAnchor={tick.textAnchor} fontSize="8" fill="#a3a3a3" fontFamily="'DM Sans', 'Helvetica Neue', sans-serif">
            {tick.label}
          </text>
        </g>
      ))}
      <path d={pd + ` L ${outerWidth - margin.right} ${margin.top + chartHeight} L ${margin.left} ${margin.top + chartHeight} Z`} fill="url(#eg)" />
      <path d={pd} fill="none" stroke="#f97316" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function buildGpx(route, trackCoords = route.waypoints) {
  const now = new Date().toISOString();
  const trkpts = trackCoords.map(([lat, lng]) =>
    `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function RidePlanner() {
  const [step, setStep] = useState(1);
  const [startAddress, setStartAddress] = useState("");
  const [useGPS, setUseGPS] = useState(false);
  const [distance, setDistance] = useState(16);
  const [elevSlider, setElevSlider] = useState(1);
  const [preferLoop, setPreferLoop] = useState(true);
  const [stravaAvailable, setStravaAvailable] = useState(true);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaAthlete, setStravaAthlete] = useState(null);
  const [stravaBusy, setStravaBusy] = useState(false);
  const [stravaMessage, setStravaMessage] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [route, setRoute] = useState(null);
  const [startLatLng, setStartLatLng] = useState(null);
  const [showCoffeeV2, setShowCoffeeV2] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeMessage, setRouteMessage] = useState(null);
  const [addressCandidates, setAddressCandidates] = useState([]);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState(0);
  const [confirmedAddress, setConfirmedAddress] = useState(null);
  const [addressLookupBusy, setAddressLookupBusy] = useState(false);

  const preset = ELEVATION_PRESETS[elevSlider];
  const ftColor = v => v <= 25 ? "#22c55e" : v <= 50 ? "#84cc16" : v <= 100 ? "#f59e0b" : "#ef4444";
  const canGo = useGPS || startAddress;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/strava/status", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check Strava status.");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setStravaAvailable(Boolean(data.available));
        setStravaConnected(Boolean(data.connected));
        setStravaAthlete(data.athlete || null);
      })
      .catch(() => {
        if (cancelled) return;
        setStravaAvailable(false);
        setStravaConnected(false);
        setStravaAthlete(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const strava = url.searchParams.get("strava");
    if (!strava) return;

    setStravaMessage(STRAVA_MESSAGES[strava] || "Strava status updated.");
    if (strava === "connected") {
      setStravaConnected(true);
    }

    url.searchParams.delete("strava");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (useGPS) return undefined;

    const query = startAddress.trim();
    if (!query || query.length < 4) {
      setAddressCandidates([]);
      setAddressLookupBusy(false);
      return undefined;
    }

    if (confirmedAddress?.query === query) {
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setAddressLookupBusy(true);
      try {
        const candidates = await searchAddressCandidates(query);
        if (cancelled) return;
        setAddressCandidates(candidates);
        setSelectedAddressIndex(0);
      } finally {
        if (!cancelled) setAddressLookupBusy(false);
      }
    }, looksLikeStreetAddress(query) ? 150 : 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [startAddress, useGPS, confirmedAddress]);

  const handleGenerate = async () => {
    if (!canGo) return;
    setRouteMessage(null);
    setGenerating(true);
    try {
      if (!useGPS) {
        if (!confirmedAddress || confirmedAddress.query !== startAddress.trim()) {
          const candidates = await searchAddressCandidates(startAddress.trim());
          setAddressCandidates(candidates);
          setSelectedAddressIndex(0);
          if (!candidates.length) {
            setRouteMessage("We could not find that address. Try a more complete SF or Marin address.");
          } else {
            setRouteMessage(looksLikeStreetAddress(startAddress.trim())
              ? "We found address candidates. Confirm the exact address before we create the route."
              : "Confirm the exact starting address before we create the route.");
          }
          return;
        }
      }

      const latlng = useGPS
        ? [37.7996, -122.4183]
        : [confirmedAddress.lat, confirmedAddress.lng];
      const routeDefinition = selectBestDynamicRoute(distance, preset.ftPerMile, preferLoop);
      const built = buildRoute(
        routeDefinition,
        latlng,
        distance,
      );
      setStartLatLng(latlng);
      setRoute(built);
      setRouteGeometry(null);
      setStep(2);
      setActiveTab("overview");
    } catch {
      setRouteMessage("We could not locate that starting address. Try a more complete address or use GPS.");
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmAddress = () => {
    const candidate = addressCandidates[selectedAddressIndex];
    if (!candidate) return;
    setConfirmedAddress({
      ...candidate,
      query: startAddress.trim(),
    });
    setRouteMessage(`Starting point confirmed: ${candidate.label}`);
  };

  const handleStravaConnect = () => {
    if (!stravaAvailable) {
      setStravaMessage("Strava is not configured for this deployment yet.");
      return;
    }

    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/strava/connect?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleStravaSave = async () => {
    if (!route || stravaBusy) return;

    setStravaBusy(true);
    setStravaMessage(null);

    try {
      const response = await fetch("/api/strava/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: route.name,
          description: route.description,
          gpx: buildGpx(route, routeGeometry || route.waypoints),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Strava upload failed.");
      }

      setExportSuccess("strava");
      setStravaMessage(data.status || "Route sent to Strava. Processing may take a moment.");
      setTimeout(() => setExportSuccess(null), 3000);
    } catch (error) {
      setStravaMessage(error instanceof Error ? error.message : "Strava upload failed.");
      if (error instanceof Error && error.message.includes("Connect Strava")) {
        setStravaConnected(false);
        setStravaAthlete(null);
      }
    } finally {
      setStravaBusy(false);
    }
  };

  const handleGPXDownload = () => {
    if (!route) return;
    const gpx = buildGpx(route, routeGeometry || route.waypoints);
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
        .rp-header-inner{max-width:760px;margin:0 auto;padding:0 24px;height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px}
        .rp-main{max-width:760px;margin:0 auto;padding:40px 24px 100px}
        .rp-hero{margin-bottom:44px}
        .rp-form-grid{display:grid;gap:30px}
        .rp-inline-row{display:flex;gap:8px}
        .rp-distance-row{display:flex;align-items:center;gap:14px}
        .rp-elevation-labels{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:7px}
        .rp-elevation-label{font-size:12px;color:#ccc;text-align:center;transition:all 0.15s}
        .rp-elevation-label.active{font-weight:600;color:#111}
        .rp-elevation-label:first-child{text-align:left}
        .rp-elevation-label:last-child{text-align:right}
        .rp-toggle-group{display:flex;gap:8px}
        .rp-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:24px}
        .rp-tabs{display:flex;border-bottom:1px solid #ebebeb;margin-bottom:20px;overflow-x:auto;scrollbar-width:none}
        .rp-tabs::-webkit-scrollbar{display:none}
        .rp-export-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        @media (max-width: 720px){
          .rp-main{padding:28px 18px 72px}
          .rp-hero{margin-bottom:32px}
          .rp-inline-row,.rp-distance-row{flex-direction:column;align-items:stretch}
          .rp-toggle-group{display:grid;grid-template-columns:1fr 1fr}
          .rp-toggle-group > button,.rp-export-row > button{width:100%;justify-content:center}
          .rp-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .rp-tabs{margin-left:-18px;margin-right:-18px;padding:0 18px}
          .rp-export-row{flex-direction:column;align-items:stretch}
        }
        @media (max-width: 520px){
          .rp-header-inner{padding:0 16px;height:58px}
          .rp-main{padding:24px 16px 56px}
          .rp-hero h1{font-size:26px;line-height:1.12}
          .rp-hero p{font-size:14px;line-height:1.55}
          .rp-elevation-labels{grid-template-columns:repeat(2,minmax(0,1fr))}
          .rp-elevation-label{text-align:left}
          .rp-elevation-label:last-child{text-align:left}
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: "1px solid #ebebeb", background: "rgba(250,250,248,0.94)", position: "sticky", top: 0, zIndex: 200, backdropFilter: "blur(10px)" }}>
        <div className="rp-header-inner">
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
            <button onClick={() => { setStep(1); setRoute(null); setRouteGeometry(null); setExportSuccess(null); setRouteMessage(null); }}
              style={{ fontSize: 13, color: "#555", background: "none", border: "1px solid #e5e5e5", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>
              ← New route
            </button>
          )}
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="rp-main">

        {/* ── Step 1: Input form ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="fade-in">
            <div className="rp-hero">
              <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.7px", lineHeight: 1.18, marginBottom: 10 }}>Plan your ride.</h1>
              <p style={{ color: "#888", fontSize: 14.5, lineHeight: 1.65 }}>Tell us where you're starting and what you want. We'll build the route.</p>
            </div>

            <div className="rp-form-grid">
              {/* Starting point */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#999", display: "block", marginBottom: 10 }}>Starting point</label>
                <div className="rp-inline-row">
                  <input type="text" placeholder="Address or neighborhood in SF / Marin"
                    value={startAddress} onChange={e => {
                      setStartAddress(e.target.value);
                      setUseGPS(false);
                      setRouteMessage(null);
                      setAddressCandidates([]);
                      setSelectedAddressIndex(0);
                      setConfirmedAddress(null);
                    }}
                    style={{ flex: 1, border: "1.5px solid", borderColor: startAddress ? "#111" : "#e5e5e5", borderRadius: 10, padding: "13px 16px", fontSize: 14, background: "#fff", outline: "none", transition: "border-color 0.15s", fontFamily: "inherit" }}
                  />
                  <button onClick={() => {
                    setUseGPS(true);
                    setStartAddress("Using your location");
                    setRouteMessage(null);
                    setAddressCandidates([]);
                    setSelectedAddressIndex(0);
                    setConfirmedAddress(null);
                  }}
                    style={{ border: "1.5px solid", borderColor: useGPS ? "#111" : "#e5e5e5", borderRadius: 10, padding: "0 15px", background: useGPS ? "#111" : "#fff", color: useGPS ? "#fff" : "#666", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", transition: "all 0.15s", fontFamily: "inherit" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                    GPS
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#bbb", marginTop: 7 }}>e.g. "Russian Hill", "Ferry Building", "Marina"</p>
                {addressLookupBusy && !useGPS && (
                  <p style={{ fontSize: 12, color: "#999", marginTop: 10 }}>Looking up address suggestions…</p>
                )}
                {!!addressCandidates.length && !useGPS && (
                  <div className="fade-in" style={{ marginTop: 12, background: "#fff", border: "1px solid #ebebeb", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>
                      {looksLikeStreetAddress(startAddress.trim())
                        ? "Choose the full address you mean:"
                        : "Confirm your exact starting address:"}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {addressCandidates.slice(0, 4).map((candidate, index) => {
                        const active = selectedAddressIndex === index;
                        return (
                          <button
                            key={`${candidate.label}-${index}`}
                            onClick={() => setSelectedAddressIndex(index)}
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1.5px solid",
                              borderColor: active ? "#111" : "#e5e5e5",
                              background: active ? "#f9f9f7" : "#fff",
                              color: "#444",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 12.5,
                              lineHeight: 1.5,
                            }}
                          >
                            {candidate.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={handleConfirmAddress}
                      style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Confirm starting point
                    </button>
                  </div>
                )}
                {confirmedAddress && confirmedAddress.query === startAddress.trim() && !useGPS && (
                  <p style={{ fontSize: 12, color: "#777", marginTop: 10 }}>
                    Confirmed: {confirmedAddress.label}
                  </p>
                )}
              </div>

              {/* Distance */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#999", display: "block", marginBottom: 10 }}>Distance</label>
                <div className="rp-distance-row">
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
                <div className="rp-elevation-labels">
                  {ELEVATION_PRESETS.map((p, i) => {
                    return (
                      <span key={p.label} className={`rp-elevation-label ${elevSlider === i ? "active" : ""}`}>{p.label}</span>
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
                <div className="rp-toggle-group">
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
              {routeMessage && (
                <div className="fade-in" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "11px 16px", fontSize: 13, color: "#9a3412" }}>
                  {routeMessage}
                </div>
              )}
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
            <div className="rp-stats-grid">
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
              <RouteMap route={route} startLatLng={startLatLng} onGeometryResolved={setRouteGeometry} />
              {route.hasGGBCrossing && (
                <div style={{ padding: "10px 16px", background: "#fffbeb", borderTop: "1px solid #fef3c7" }}>
                  <p style={{ fontSize: 12, color: "#92400e", lineHeight: 1.55 }}>* GGB west sidewalk open sunrise–sunset. Confirm hours at nps.gov/goga before riding.</p>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="rp-tabs">
              {["overview", "elevation", "scenic"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: "9px 17px", fontSize: 13, fontWeight: 500, background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#111" : "transparent"}`, color: activeTab === tab ? "#111" : "#aaa", cursor: "pointer", marginBottom: -1, transition: "all 0.15s", fontFamily: "inherit", textTransform: "capitalize" }}>
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="fade-in" style={{ fontSize: 14, color: "#555", lineHeight: 1.75 }}>
                <p>{route.isOutAndBack ? "Route rides out to a turnaround point, then returns on the same corridor." : route.isLoop ? "Route starts and ends at your location." : "Route starts at your location and finishes at the planned destination."} Built for a moderate pace (~12 mph avg), total ride time about {Math.floor(route.time / 60) > 0 ? `${Math.floor(route.time / 60)}h ` : ""}{route.time % 60}min. Suitable for road bikes. Primarily paved — some crushed gravel in park sections.</p>
                {Math.abs(route.distanceDelta) > 0.1 && (
                  <p style={{ marginTop: 12 }}>
                    Requested {route.requestedDistance.toFixed(1)} mi. Best clean match is {route.distance.toFixed(1)} mi to keep the route shape natural.
                  </p>
                )}
                {route.routeTypeAdjusted && (
                  <p style={{ marginTop: 12 }}>
                    We switched the route type to keep the ride closer to your requested mileage without forcing a bad-looking route.
                  </p>
                )}
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
                  <ElevationChart profile={route.elevationProfile} distance={route.distance} />
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
              {stravaMessage && (
                <div className="fade-in" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "11px 16px", marginBottom: 14, fontSize: 13, color: "#9a3412" }}>
                  {stravaMessage}
                </div>
              )}
              {exportSuccess && (
                <div className="fade-in" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "11px 16px", marginBottom: 14, fontSize: 13, color: "#15803d", display: "flex", alignItems: "center", gap: 8 }}>
                  ✓ {exportSuccess === "strava" ? "Route saved to your Strava account." : "GPX downloaded — import in Strava or Garmin Connect."}
                </div>
              )}
              {stravaConnected && stravaAthlete && (
                <div style={{ fontSize: 12.5, color: "#666", marginBottom: 12 }}>
                  Connected as {stravaAthlete.firstname} {stravaAthlete.lastname}
                </div>
              )}
              <div className="rp-export-row">
                {!stravaConnected ? (
                  <button onClick={handleStravaConnect} disabled={!stravaAvailable}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10, border: "1.5px solid #FC4C02", background: "#fff", color: stravaAvailable ? "#FC4C02" : "#d6d3d1", fontSize: 13, fontWeight: 600, cursor: stravaAvailable ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: stravaAvailable ? 1 : 0.7 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#FC4C02"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" /></svg>
                    {stravaAvailable ? "Connect Strava" : "Strava unavailable"}
                  </button>
                ) : (
                  <button onClick={handleStravaSave} disabled={stravaBusy}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10, border: "none", background: "#FC4C02", color: "#fff", fontSize: 13, fontWeight: 600, cursor: stravaBusy ? "wait" : "pointer", fontFamily: "inherit", opacity: stravaBusy ? 0.8 : 1 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" /></svg>
                    {stravaBusy ? "Saving to Strava…" : "Save to Strava"}
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
