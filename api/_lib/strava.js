import crypto from "node:crypto";

const SESSION_COOKIE = "routa_strava_session";
const STATE_COOKIE = "routa_strava_state";
const TOKEN_REFRESH_BUFFER_SECONDS = 300;

function getSecret() {
  const secret = process.env.ROUTA_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ROUTA_SESSION_SECRET must be set to at least 32 characters.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
}

function encryptJson(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSecret(), iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext].map(base64UrlEncode).join(".");
}

function decryptJson(value) {
  const [ivPart, tagPart, ciphertextPart] = String(value || "").split(".");
  if (!ivPart || !tagPart || !ciphertextPart) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getSecret(),
      base64UrlDecode(ivPart),
    );
    decipher.setAuthTag(base64UrlDecode(tagPart));
    const plaintext = Buffer.concat([
      decipher.update(base64UrlDecode(ciphertextPart)),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [name, ...rest] = part.split("=");
      acc[name] = decodeURIComponent(rest.join("="));
      return acc;
    }, {});
}

export function serializeCookie(name, value, options = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.secure) attributes.push("Secure");
  if (options.sameSite) attributes.push(`SameSite=${options.sameSite}`);
  if (options.path) attributes.push(`Path=${options.path}`);

  return attributes.join("; ");
}

export function getBaseUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

export function getRedirectUri(req) {
  return process.env.STRAVA_REDIRECT_URI || `${getBaseUrl(req)}/api/strava/callback`;
}

export function getStravaConfig(req) {
  return {
    clientId: process.env.STRAVA_CLIENT_ID || "",
    clientSecret: process.env.STRAVA_CLIENT_SECRET || "",
    redirectUri: getRedirectUri(req),
  };
}

export function isStravaConfigured(req) {
  const { clientId, clientSecret } = getStravaConfig(req);
  return Boolean(clientId && clientSecret);
}

export function createStateCookie(returnTo = "/") {
  const nonce = crypto.randomBytes(24).toString("hex");
  const payload = encryptJson({
    nonce,
    returnTo,
    createdAt: Date.now(),
  });

  return {
    nonce,
    cookie: serializeCookie(STATE_COOKIE, payload, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: true,
      maxAge: 600,
    }),
  };
}

export function readState(req) {
  const cookies = parseCookies(req.headers.cookie);
  return decryptJson(cookies[STATE_COOKIE]);
}

export function clearStateCookie() {
  return serializeCookie(STATE_COOKIE, "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: true,
    maxAge: 0,
  });
}

export function createSessionCookie(session) {
  return serializeCookie(SESSION_COOKIE, encryptJson(session), {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: true,
    maxAge: 0,
  });
}

export function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return decryptJson(cookies[SESSION_COOKIE]);
}

export async function exchangeCodeForToken(req, code) {
  const { clientId, clientSecret, redirectUri } = getStravaConfig(req);
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Strava token exchange failed.");
  }

  return data;
}

export async function refreshAccessToken(req, refreshToken) {
  const { clientId, clientSecret } = getStravaConfig(req);
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Strava token refresh failed.");
  }

  return data;
}

export function buildSession(tokenPayload) {
  return {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: tokenPayload.expires_at,
    athlete: tokenPayload.athlete
      ? {
          id: tokenPayload.athlete.id,
          firstname: tokenPayload.athlete.firstname,
          lastname: tokenPayload.athlete.lastname,
        }
      : null,
  };
}

export async function ensureFreshSession(req) {
  const session = readSession(req);
  if (!session?.refreshToken) return { session: null, refreshed: false };

  const expiresSoon =
    !session.expiresAt ||
    Number(session.expiresAt) <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_BUFFER_SECONDS;

  if (!expiresSoon) {
    return { session, refreshed: false };
  }

  const refreshedToken = await refreshAccessToken(req, session.refreshToken);
  return {
    session: buildSession(refreshedToken),
    refreshed: true,
  };
}
