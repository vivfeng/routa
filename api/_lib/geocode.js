const SF_MARIN_VIEWBOX = "-122.55,37.93,-122.34,37.70";

function normalizeAddressQuery(query) {
  return String(query || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function buildQueryVariants(query) {
  const normalized = normalizeAddressQuery(query);
  const streetLine = normalized.split(",")[0]?.trim() || normalized;
  const noCountry = normalized.replace(/,?\s*United States$/i, "").trim();
  const noRegionTail = noCountry.replace(/,?\s*San Francisco,\s*CA\s*\d{5}$/i, "").trim();
  const streetAndZip = [streetLine, normalized.match(/\b\d{5}\b/)?.[0]].filter(Boolean).join(" ");

  return [...new Set([normalized, noCountry, noRegionTail, streetLine, streetAndZip].filter(Boolean))];
}

export async function searchSfMarinAddresses(query) {
  const candidates = [];

  for (const variant of buildQueryVariants(query)) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${variant}, San Francisco or Marin County, California`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("viewbox", SF_MARIN_VIEWBOX);
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Routa/1.0 (SF Marin route planner)",
      },
    });

    if (!response.ok) {
      throw new Error("Upstream geocoding request failed.");
    }

    const results = await response.json();
    if (!Array.isArray(results)) continue;

    candidates.push(
      ...results
        .filter((result) => result?.lat && result?.lon)
        .filter((result) => {
          const display = String(result.display_name || "").toLowerCase();
          return display.includes("san francisco") || display.includes("marin");
        })
        .map((result) => ({
          lat: Number(result.lat),
          lng: Number(result.lon),
          label: result.display_name || variant,
        }))
    );

    if (candidates.length) break;
  }

  return [...new Map(candidates.map((candidate) => [candidate.label, candidate])).values()];
}

export async function lookupSfMarinAddress(query) {
  const results = await searchSfMarinAddresses(query);
  return results[0] || null;
}
