/**
 * Draftzenn API — verify the calling creator's Supabase session.
 * ---------------------------------------------------------------------------
 * Every /api/youtube/* endpoint (except the Google callback redirect, which
 * is authenticated via the signed `state` value instead) requires the
 * frontend to send the creator's own Supabase access token:
 *
 *   Authorization: Bearer <supabase access token>
 *
 * This is the SAME token js/supabase-config.js already holds client-side
 * (window.supabaseClient.auth.getSession()) — nothing new or secret is
 * introduced on the frontend. We verify it server-side against Supabase's
 * auth server using the admin client, which confirms both who the creator
 * is and that the token hasn't expired/been revoked.
 *
 * Adapted for Cloudflare Pages Functions: reads the header off the
 * standard Fetch API `Request` object instead of Node's `req.headers`.
 */

import { getAdminClient } from './supabaseAdmin.js';

function getBearerToken(request) {
  var header = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!header || header.indexOf('Bearer ') !== 0) return null;
  return header.slice('Bearer '.length).trim();
}

/** Resolves { id, email } for the signed-in creator, or throws (with statusCode). */
async function requireUser(request, env) {
  var token = getBearerToken(request);
  if (!token) {
    var err = new Error('Missing Authorization bearer token.');
    err.statusCode = 401;
    throw err;
  }

  var result = await getAdminClient(env).auth.getUser(token);
  if (result.error || !result.data || !result.data.user) {
    var authErr = new Error('Invalid or expired session.');
    authErr.statusCode = 401;
    throw authErr;
  }
  return { id: result.data.user.id, email: result.data.user.email };
}

export { requireUser, getBearerToken };
