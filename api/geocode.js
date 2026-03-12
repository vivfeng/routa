import { searchSfMarinAddresses } from "./_lib/geocode.js";

export default async function handler(req, res) {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) {
    res.status(400).json({ error: "Missing q query parameter." });
    return;
  }

  try {
    const candidates = await searchSfMarinAddresses(query);
    if (!candidates.length) {
      res.status(404).json({ error: "Address not found." });
      return;
    }

    res.status(200).json({
      best: candidates[0],
      candidates,
    });
  } catch {
    res.status(502).json({ error: "Geocoding unavailable." });
  }
}
