/**
 * POST /api/youtube/disconnect  (Cloudflare Pages Function)
 * ---------------------------------------------------------------------------
 * Requires the creator's Supabase session. Revokes the stored Google token
 * (best-effort) and deletes both the token row and the connection row.
 * Never touches Content History, Performance, Radar, Learning, or Content
 * Plan — imported records already saved stay exactly where they are.
 *
 * Logic is unchanged from the original Vercel-style handler; only the
 * request/response and env-access plumbing were adapted for Cloudflare
 * Pages Functions.
 */

import { requireUser } from '../_lib/auth.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';
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

  var admin = getAdminClient(env);

  var tokenRowResult = await admin
    .from('youtube_oauth_tokens')
    .select('access_token, refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();
  var tokenRow = tokenRowResult.data;

  if (tokenRow && (tokenRow.refresh_token || tokenRow.access_token)) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' +
        encodeURIComponent(tokenRow.refresh_token || tokenRow.access_token), { method: 'POST' });
    } catch (e) {
      // Best-effort — proceed to remove our own records regardless.
      console.warn('[youtube/disconnect] token revoke request failed:', e.message);
    }
  }

  await admin.from('youtube_oauth_tokens').delete().eq('user_id', user.id);
  await admin.from('youtube_connections').upsert({
    user_id: user.id,
    status: 'not_connected',
    channel_id: null,
    channel_name: null,
    channel_url: null,
    subscriber_count: null,
    total_views: null,
    connected_at: null,
    last_synced_at: null,
    error: null
  }, { onConflict: 'user_id' });

  return json({ ok: true }, 200);
}
