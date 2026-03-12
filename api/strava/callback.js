import {
  buildSession,
  clearStateCookie,
  createSessionCookie,
  exchangeCodeForToken,
  readState,
} from "../_lib/strava.js";

function withQueryParam(path, key, value) {
  const base = path || "/";
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export default async function handler(req, res) {
  const state = readState(req);
  const returnTo = state?.returnTo || "/";

  if (req.query.error) {
    res.setHeader("Set-Cookie", clearStateCookie());
    res.redirect(withQueryParam(returnTo, "strava", "denied"));
    return;
  }

  if (!state?.nonce || req.query.state !== state.nonce || typeof req.query.code !== "string") {
    res.setHeader("Set-Cookie", clearStateCookie());
    res.redirect(withQueryParam(returnTo, "strava", "invalid_state"));
    return;
  }

  try {
    const tokenPayload = await exchangeCodeForToken(req, req.query.code);
    res.setHeader("Set-Cookie", [
      clearStateCookie(),
      createSessionCookie(buildSession(tokenPayload)),
    ]);
    res.redirect(withQueryParam(returnTo, "strava", "connected"));
  } catch {
    res.setHeader("Set-Cookie", clearStateCookie());
    res.redirect(withQueryParam(returnTo, "strava", "exchange_failed"));
  }
}
