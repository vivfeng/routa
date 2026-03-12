import { createStateCookie, getRedirectUri, getStravaConfig, isStravaConfigured } from "../_lib/strava.js";

export default function handler(req, res) {
  if (!isStravaConfigured(req)) {
    res.status(503).json({
      error: "Strava is not configured on this deployment.",
    });
    return;
  }

  const returnTo = typeof req.query.returnTo === "string" && req.query.returnTo.startsWith("/")
    ? req.query.returnTo
    : "/";
  const { nonce, cookie } = createStateCookie(returnTo);
  const { clientId } = getStravaConfig(req);
  const redirectUri = encodeURIComponent(getRedirectUri(req));
  const scope = encodeURIComponent("activity:write,read");
  const authorizeUrl =
    `https://www.strava.com/oauth/authorize?client_id=${clientId}` +
    `&response_type=code&redirect_uri=${redirectUri}` +
    `&approval_prompt=auto&scope=${scope}&state=${nonce}`;

  res.setHeader("Set-Cookie", cookie);
  res.redirect(authorizeUrl);
}
