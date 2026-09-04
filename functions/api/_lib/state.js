/**
 * Draftzenn API — signed OAuth "state" helper (Cloudflare Pages Functions).
 * ---------------------------------------------------------------------------
 * Same purpose as the original Vercel version: the OAuth `state` parameter
 * carries which creator started the flow across the redirect to Google and
 * back, plus CSRF protection and a short expiry. It is signed (HMAC-SHA256)
 * with a server-only secret so it can't be forged or replayed for a
 * different user — but it contains no secrets itself (just a user id,
 * nonce, and timestamp), so it's fine to round-trip through the browser
 * URL bar as Google's OAuth flow requires.
 *
 * Rewritten to use the Web Crypto API (`crypto.subtle`) instead of Node's
 * `crypto` module / `Buffer`, since only Web Crypto is guaranteed available
 * in the Cloudflare Workers runtime without extra compatibility flags.
 * `crypto.subtle.verify` also does a constant-time comparison internally,
 * which replaces the manual `timingSafeEqual` check from the Node version.
 */

import { config } from './config.js';

var MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes to complete the consent flow

function toBase64Url(bytes) {
  var str = '';
  for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var str = atob(b64);
  var bytes = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(env, payload) {
  var json = JSON.stringify(payload);
  var b64 = toBase64Url(new TextEncoder().encode(json));
  var key = await importKey(config.OAUTH_STATE_SECRET(env));
  var sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b64));
  var sig = toBase64Url(new Uint8Array(sigBuf));
  return b64 + '.' + sig;
}

/** Returns the signed state payload { userId, ts } if valid/unexpired, else null. */
export async function verifyState(env, state) {
  if (!state || typeof state !== 'string' || state.indexOf('.') === -1) return null;
  var parts = state.split('.');
  var b64 = parts[0];
  var sig = parts[1];
  if (!b64 || !sig) return null;

  var key = await importKey(config.OAUTH_STATE_SECRET(env));
  var valid;
  try {
    valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(sig), new TextEncoder().encode(b64));
  } catch (e) {
    return null;
  }
  if (!valid) return null;

  var payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(b64)));
  } catch (e) {
    return null;
  }

  if (!payload || typeof payload.userId !== 'string' || typeof payload.ts !== 'number') return null;
  if (Date.now() - payload.ts > MAX_AGE_MS) return null; // expired

  return payload;
}

/** Creates a fresh signed state value for the given Supabase user id. */
export function createState(env, userId) {
  return sign(env, { userId: userId, nonce: crypto.randomUUID(), ts: Date.now() });
}
