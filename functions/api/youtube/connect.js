/**
 * POST /api/youtube/connect  (Cloudflare Pages Function)
 * ---------------------------------------------------------------------------
 * Starts the real Google OAuth flow. Requires the creator's Supabase
 * session (Authorization: Bearer <token>). Returns { url } — the frontend
 * navigates the browser to it (window.location.href = url); this endpoint
 * never itself talks to Google beyond building the URL, and never sees or
 * stores any token.
 *
 * No client secret is used here — only the OAuth client ID, which is not
 * secret (Google's own docs treat it as public/embeddable).
 *
 * Logic is unchanged from the original Vercel-style handler; only the
 * request/response and env-access plumbing were adapted for Cloudflare
 * Pages Functions (Fetch API Request/Response, context.env instead of
 * process.env — see /functions/api/_lib/config.js).
 */

import { config } from '../_lib/config.js';
import { requireUser } from '../_lib/auth.js';
import { createState } from '../_lib/state.js';
import { json } from '../_lib/http.js';

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;

  var user;
  try {
    user = await requireUser(request, env);
  } catch (err) {
    return json({ error: err.message }, err.statusCode || 401);
  }

  try {
    var state = await createState(env, user.id);

    var params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID(env),
      redirect_uri: config.GOOGLE_REDIRECT_URI(env),
      response_type: 'code',
      scope: config.YOUTUBE_SCOPE,
      access_type: 'offline',   // needed to receive a refresh_token
      prompt: 'consent',        // ensures a refresh_token is issued every time
      include_granted_scopes: 'true',
      state: state
    });

    var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
    return json({ url: authUrl }, 200);
  } catch (err) {
    // Missing env vars, etc. — never leak details to the client.
    console.error('[youtube/connect] config error:', err.message);
    return json({ error: 'YouTube connection isn\u2019t configured on the server yet.' }, 500);
  }
}
