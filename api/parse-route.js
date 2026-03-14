const KNOWN_LOCATIONS = [
  "russian hill", "marina", "mission", "castro", "haight", "noe valley",
  "soma", "hayes valley", "north beach", "fisherman", "pacific heights",
  "richmond", "sunset", "embarcadero", "ferry building", "presidio",
  "sausalito", "tiburon", "sam's anchor", "mill valley", "stinson beach",
  "ocean beach", "golden gate park", "crissy field", "fort mason",
  "corte madera", "andytown ocean beach", "andytown outer sunset",
  "andytown taraval", "andytown", "the laundromat", "laundromat",
  "arsicault", "equator", "equator sausalito", "equator fort mason",
  "equator soma", "equator round house", "equator golden gate",
  "equator mill valley", "equator larkspur", "equator shoreline", "flour craft",
  "flour craft mill valley", "sunlife", "sunlife corte madera", "sun life",
  "philz", "philz corte madera", "philz marina", "philz castro",
  "philz mission", "philz noe valley", "philz russian hill",
];

const SYSTEM_PROMPT = `You extract cycling route parameters from natural language descriptions.
The user is planning a bike ride in San Francisco / Marin County.

Known starting locations and destinations: ${KNOWN_LOCATIONS.join(", ")}

Return ONLY a JSON object (no markdown, no code fences) with these fields:
- "startAddress": string — the starting neighborhood or address. Default "Russian Hill" if not specified.
- "distance": number — ride distance in miles. Default 16 if not specified.
- "elevationPreference": number 0-4 — index into elevation presets: 0=Mostly Flat, 1=Moderate, 2=Rolling, 3=Hilly, 4=Very Hilly. Interpret "flat"/"easy"/"fewest hills"/"least hills" as 0, "not too hilly" as 1, "hilly" as 3, "very hilly" as 4. Default 1.
- "preferLoop": boolean — true for loop, false for out-and-back or point-to-point. If a destination is mentioned, set false. Default true.
- "destination": string or null — if the user wants to ride TO a specific place, put it here. Otherwise null.
- "roundTrip": boolean — true ONLY if the user explicitly says "and back", "round trip", "out and back", or similar. If they just say "ride to X", this is false (one-way). Default false when destination is specified, true when no destination.

Examples:
Input: "Flat 15-mile loop from the Marina"
Output: {"startAddress":"Marina","distance":15,"elevationPreference":0,"preferLoop":true,"destination":null,"roundTrip":true}

Input: "Ride to Sausalito from Russian Hill, not too hilly"
Output: {"startAddress":"Russian Hill","distance":16,"elevationPreference":1,"preferLoop":false,"destination":"sausalito","roundTrip":false}

Input: "Go to Sam's Anchor Cafe from the Ferry Building with the least hills"
Output: {"startAddress":"Ferry Building","distance":16,"elevationPreference":0,"preferLoop":false,"destination":"sam's anchor","roundTrip":false}

Input: "Ride to Equator in Sausalito and back, keep it flat"
Output: {"startAddress":"Russian Hill","distance":16,"elevationPreference":0,"preferLoop":false,"destination":"equator sausalito","roundTrip":true}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing 'text' in request body" });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).json({ error: `Anthropic API error: ${err}` });
  }

  const data = await response.json();
  const content = (data.content?.[0]?.text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch {
    return res.status(500).json({ error: "Failed to parse AI response", raw: content });
  }
}
