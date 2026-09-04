/**
 * GET /api/youtube/callback  (Cloudflare Pages Function)
 * ---------------------------------------------------------------------------
 * Google redirects the creator's browser here after consent. This endpoint:
 *   1. Verifies the signed `state` (proves which creator started the flow,
 *      and that it wasn't forged/replayed/expired).
 *   2. Exchanges the authorization `code` for tokens using the client
 *      secret (server-only env var — never sent to the browser).
 *   3. Calls YouTube Data API `channels.list?mine=true` to get the
 *      creator's own channel (identity + read-only stats).
 *   4. Stores channel metadata in `youtube_connections` and the tokens in
 *      `youtube_oauth_tokens` (service-role write; RLS blocks any other
 *      access to that table entirely — see sql/youtube_connections.sql).
 *   5. Redirects the browser back to connected-platforms.html with a
 *      status query param. No token, code, or secret is ever put in that
 *      redirect URL.
 *
 * Logic is unchanged from the original Vercel-style handler; only the
 * request/response and env-access plumbing were adapted for Cloudflare
 * Pages Functions (query params read from the Fetch API Request's URL,
 * a real Response returned instead of res.writeHead/res.end).
 */

import { config } from '../_lib/config.js';
import { verifyState } from '../_lib/state.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';

function redirectTo(env, statusParam) {
  var url = config.APP_BASE_URL(env) + '/connected-platforms.html?youtube=' + encodeURIComponent(statusParam);
  return Response.redirect(url, 302);
}

function toIntOrNull(v) {
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function markError(admin, userId, message) {
  return admin.from('youtube_connections').upsert({
    user_id: userId,
    status: 'error',
    error: message
  }, { onConflict: 'user_id' });
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var query = new URL(request.url).searchParams;

  // Creator clicked "Cancel" on Google's consent screen.
  if (query.get('error')) {
    return redirectTo(env, query.get('error') === 'access_denied' ? 'cancelled' : 'error');
  }

  var statePayload = await verifyState(env, query.get('state'));
  var code = query.get('code');
  if (!statePayload || !code) {
    return redirectTo(env, 'error');
  }
  var userId = statePayload.userId;

  var admin = getAdminClient(env);

  try {
    // ---- 1. Exchange the authorization code for tokens -----------------
    var tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: config.GOOGLE_CLIENT_ID(env),
        client_secret: config.GOOGLE_CLIENT_SECRET(env),
        redirect_uri: config.GOOGLE_REDIRECT_URI(env),
        grant_type: 'authorization_code'
      })
    });
    var tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[youtube/callback] token exchange failed:', tokenData.error);
      await markError(admin, userId, 'Google didn\u2019t return an access token.');
      return redirectTo(env, 'error');
    }

    // ---- 2. Fetch the creator's own channel -----------------------------
    var channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      { headers: { Authorization: 'Bearer ' + tokenData.access_token } }
    );
    var channelData = await channelRes.json();
    var channel = channelData.items && channelData.items[0];

    if (!channelRes.ok || !channel) {
      await markError(admin, userId, 'No YouTube channel was found on this Google account.');
      return redirectTo(env, 'no_channel');
    }

    var stats = channel.statistics || {};
    var snippet = channel.snippet || {};

    // ---- 3. Store the refresh/access tokens (secrets table, no RLS access
    //         for anon/authenticated roles — service role only). ---------
    var expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();
    var tokenRow = {
      user_id: userId,
      access_token: tokenData.access_token,
      // Google only returns a refresh_token on the first consent for a
      // given account; keep the previous one if this is a re-connect.
      refresh_token: tokenData.refresh_token || undefined,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    };
    if (!tokenData.refresh_token) delete tokenRow.refresh_token;

    var existingTokenResult = await admin
      .from('youtube_oauth_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle();
    var existingToken = existingTokenResult.data;

    if (!tokenData.refresh_token && !(existingToken && existingToken.refresh_token)) {
      // No refresh token at all (shouldn't happen with prompt=consent, but
      // fail safely rather than storing a connection we can't sync later).
      await markError(admin, userId, 'Google didn\u2019t grant offline access. Please reconnect and approve the consent screen.');
      return redirectTo(env, 'error');
    }

    await admin.from('youtube_oauth_tokens').upsert(tokenRow, { onConflict: 'user_id' });

    // ---- 4. Store non-secret channel metadata (readable by the creator
    //         directly via RLS, for display on Connected Platforms). ----
    await admin.from('youtube_connections').upsert({
      user_id: userId,
      channel_id: channel.id,
      channel_name: snippet.title || null,
      channel_url: channel.id ? 'https://www.youtube.com/channel/' + channel.id : null,
      subscriber_count: stats.hiddenSubscriberCount ? null : toIntOrNull(stats.subscriberCount),
      total_views: toIntOrNull(stats.viewCount),
      status: 'connected',
      connected_at: new Date().toISOString(),
      last_synced_at: null,
      error: null
    }, { onConflict: 'user_id' });

    return redirectTo(env, 'connected');
  } catch (err) {
    console.error('[youtube/callback] unexpected error:', err.message);
    try { await markError(admin, userId, 'Something went wrong finishing the connection.'); } catch (e) {}
    return redirectTo(env, 'error');
  }
}
