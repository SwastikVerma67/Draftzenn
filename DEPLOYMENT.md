# Draftzenn — Deployment Guide (GitHub → Cloudflare Pages)

Draftzenn is a static frontend (`index.html`, `dashboard.html`,
`connected-platforms.html`, etc. + `css/` + `js/`) with no build step, plus a
small serverless API boundary under `/functions/api/youtube/*.js`, written
as Cloudflare Pages Functions (`export async function onRequestPost(context)`
/ `onRequestGet(context)`, using the standard Fetch API `Request`/`Response`
and `context.env` for secrets).

The `/api/youtube/*` handlers were originally written in Vercel's
`module.exports = async function handler(req, res)` style, which does not
run on Cloudflare. They have been converted 1:1 (same logic, same security
model) into Cloudflare Pages Functions under `/functions/api/youtube/*.js` —
see the report delivered alongside this file for exactly what changed.

## Steps

1. **Push this repository to GitHub.** Nothing in it needs to change first —
   there are no real secrets in the repo (see `.gitignore` and the "GitHub
   readiness" check below).

2. **Create a Cloudflare Pages project** connected to that GitHub repo
   (Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> Connect to
   Git).
   - Framework preset: **None**
   - Build command: *(leave empty)* — this is a static site with no build
     step
   - Build output directory: `/` (the repository root, since `index.html`
     lives there)

   Cloudflare auto-detects `/functions/api/**` and deploys each file as a
   route (`functions/api/youtube/connect.js` -> `/api/youtube/connect`,
   etc.) — no extra routing config is needed.

3. **Configure environment variables server-side**, in the Cloudflare Pages
   project -> Settings -> Environment variables (set for both Production and
   Preview). See `.env.example` for the full list and description of each:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OAUTH_STATE_SECRET`,
   `APP_BASE_URL`. Mark the secret-shaped ones (service role key, client
   secret, state secret) as **Secret**, not plain text.

4. **Run `sql/youtube_connections.sql`** in the Supabase SQL editor for your
   project (see "Supabase" below — this must happen before step 7).

5. **Configure Google Cloud**: enable the YouTube Data API v3, and create an
   OAuth 2.0 Client ID (type: Web application) in Google Cloud Console ->
   APIs & Services -> Credentials.

6. **Set the exact OAuth redirect URI** on that OAuth client to your
   deployed Cloudflare Pages callback endpoint, e.g.
   `https://your-project.pages.dev/api/youtube/callback` — this must match
   `GOOGLE_REDIRECT_URI` exactly (same scheme, host, and path). Do this only
   once you know the real `*.pages.dev` domain Cloudflare assigned (or your
   custom domain, if you attach one later) — do not guess it in advance.

7. **Deploy** by pushing to the connected branch — Cloudflare Pages builds
   and deploys automatically on every push.

8. **Test YouTube Connect**: sign in to the deployed app, go to Connected
   Platforms, click Connect, complete Google's consent screen, and confirm
   you land back on Connected Platforms with a "connected" status.

9. **Test initial sync**: click "Sync now" and confirm videos are imported
   into Content History as additive, clearly-tagged imported records.

## What's already in place (no action needed later)

- `package.json` — declares the one runtime dependency
  (`@supabase/supabase-js`) the Functions need; Cloudflare Pages installs it
  automatically during deploy.
- `.env.example` — documents every required server-side variable with no
  real values.
- `wrangler.toml` — minimal config (mainly for local `wrangler pages dev`);
  the dashboard build settings above take precedence for the deployed site.
- `sql/youtube_connections.sql` — the schema + RLS described in step 4.
- All four `/functions/api/youtube/*.js` handlers, and their shared helpers
  under `/functions/api/_lib/`, converted from the original Vercel-style
  handlers to Cloudflare Pages Functions and audited as part of this
  deployment-readiness pass.
- The frontend (`js/youtube-integration.js`, `js/connected-platforms.js`)
  already calls the real `/api` endpoints (relative paths, so they resolve
  correctly on whatever domain Cloudflare assigns) and handles a "not
  deployed yet" state honestly (a clear error message instead of a fake
  success).

## Explicitly out of scope until you deploy

- Actually creating the OAuth client, running the SQL, setting env vars, or
  deploying — all of that happens in the steps above, which only you can do
  (this pass has no access to your GitHub, Cloudflare, Supabase, or Google
  Cloud accounts).
- Attaching a custom domain — not configured automatically per the current
  instructions; do this later in Cloudflare Pages -> Custom domains if
  wanted.
