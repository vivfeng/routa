import {
  clearSessionCookie,
  createSessionCookie,
  ensureFreshSession,
  isStravaConfigured,
} from "../_lib/strava.js";

export default async function handler(req, res) {
  if (!isStravaConfigured(req)) {
    res.status(200).json({ available: false, connected: false });
    return;
  }

  try {
    const { session, refreshed } = await ensureFreshSession(req);
    if (!session) {
      res.status(200).json({ available: true, connected: false });
      return;
    }

    if (refreshed) {
      res.setHeader("Set-Cookie", createSessionCookie(session));
    }

    res.status(200).json({
      available: true,
      connected: true,
      athlete: session.athlete,
    });
  } catch {
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.status(200).json({ available: true, connected: false });
  }
}
