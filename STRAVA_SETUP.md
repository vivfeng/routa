# Strava Setup

This repo uses server-side API endpoints under `/api/strava/*` for OAuth and GPX upload. The frontend Strava button will only work after these values are configured on the deployment:

- `STRAVA_CLIENT_ID`: from your Strava API app
- `STRAVA_CLIENT_SECRET`: from your Strava API app
- `ROUTA_SESSION_SECRET`: random secret, at least 32 characters
- `STRAVA_REDIRECT_URI`: optional override for the callback URL. Default is `https://<your-domain>/api/strava/callback`

## Strava App Configuration

1. Create or open your app in the Strava API settings.
2. Set the authorization callback domain to the domain where Routa is deployed.
3. Make sure the callback URL matches `/api/strava/callback` on that domain.

## Flow

1. User clicks `Connect Strava`.
2. Routa redirects to `/api/strava/connect`.
3. Strava sends the user back to `/api/strava/callback` with an auth code.
4. The server exchanges the code for tokens and stores them in an encrypted `HttpOnly` cookie.
5. `Save to Strava` posts the generated GPX to `/api/strava/upload`, which forwards it to the Strava uploads API.

## Local Development

The Vite frontend alone does not serve the `/api` routes. To test the full Strava flow locally, run the app behind a serverless-compatible dev environment such as `vercel dev`, or deploy a preview with the env vars above.
