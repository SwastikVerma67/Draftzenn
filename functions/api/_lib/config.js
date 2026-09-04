/**
 * Draftzenn API — shared config/env reader (Cloudflare Pages Functions).
 * ---------------------------------------------------------------------------
 * SERVER-SIDE ONLY. Nothing in this file (or anywhere in /functions/api) is
 * ever shipped to the browser — it only runs on Cloudflare's edge runtime.
 *
 * Cloudflare Pages Functions receive environment variables/secrets per
 * request via `context.env` (NOT Node's `process.env`, which does not exist
 * in the Workers runtime). Every helper below therefore takes `env` as an
 * explicit argument instead of reading a global.
 *
 * Required environment variables (set these as Cloudflare Pages Secrets —
 * Pages project -> Settings -> Environment variables -> Production/Preview
 * -- never in a committed file):
 *
 *   SUPABASE_URL               - same project URL as js/supabase-config.js
 *   SUPABASE_SERVICE_ROLE_KEY  - Supabase "service_role" secret key
 *                                 (Project Settings -> API). Bypasses RLS.
 *                                 NEVER put this in any frontend file.
 *   GOOGLE_CLIENT_ID           - from Google Cloud Console OAuth client
 *   GOOGLE_CLIENT_SECRET       - from Google Cloud Console OAuth client
 *   GOOGLE_REDIRECT_URI        - e.g. https://your-project.pages.dev/api/youtube/callback
 *                                 must exactly match an "Authorized redirect
 *                                 URI" configured on the OAuth client
 *   OAUTH_STATE_SECRET         - any long random string, used only to sign
 *                                 the short-lived OAuth "state" value so it
 *                                 can't be forged/tampered with
 *   APP_BASE_URL               - e.g. https://your-project.pages.dev (no
 *                                 trailing slash) — used to build the
 *                                 redirect back to connected-platforms.html
 */

function requireEnv(env, name) {
  var value = env && env[name];
  if (!value) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value;
}

export var config = {
  requireEnv: requireEnv,
  SUPABASE_URL: function (env) { return requireEnv(env, 'SUPABASE_URL'); },
  SUPABASE_SERVICE_ROLE_KEY: function (env) { return requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'); },
  GOOGLE_CLIENT_ID: function (env) { return requireEnv(env, 'GOOGLE_CLIENT_ID'); },
  GOOGLE_CLIENT_SECRET: function (env) { return requireEnv(env, 'GOOGLE_CLIENT_SECRET'); },
  GOOGLE_REDIRECT_URI: function (env) { return requireEnv(env, 'GOOGLE_REDIRECT_URI'); },
  OAUTH_STATE_SECRET: function (env) { return requireEnv(env, 'OAUTH_STATE_SECRET'); },
  APP_BASE_URL: function (env) { return requireEnv(env, 'APP_BASE_URL'); },

  // Minimal, read-only scope: identify the channel + read its own stats.
  // Deliberately excludes youtube.upload / youtube.force-ssl / manage
  // scopes — this integration never uploads, edits, or deletes anything.
  YOUTUBE_SCOPE: 'https://www.googleapis.com/auth/youtube.readonly'
};
