/**
 * Draftzenn — Supabase configuration
 * ---------------------------------------------------------------------------
 * PUT YOUR SUPABASE CREDENTIALS HERE. This is the ONLY file that should ever
 * contain Supabase connection details.
 *
 * Where to find these values:
 *   Supabase Dashboard → Project Settings → API
 *     - "Project URL"            → SUPABASE_URL
 *     - "anon" / "public" key    → SUPABASE_ANON_KEY
 *
 * SAFE TO EXPOSE: the anon/public key is designed to be used in frontend
 * code — it only allows what your Supabase Row Level Security policies
 * permit. It is NOT a secret.
 *
 * NEVER PUT HERE: the "service_role" key (or any other secret key) from
 * the Supabase dashboard. That key bypasses Row Level Security entirely
 * and must only ever be used in trusted server-side code, never in
 * anything shipped to a browser.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // ---- Fill these in with your project's values -----------------------
  var SUPABASE_URL = 'https://wmlaqpvbbidvfexorgqc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtbGFxcHZiYmlkdmZleG9yZ3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTgyMTMsImV4cCI6MjEwNDAzNDIxM30.7Slj6lUzgKVHanzIHaLU3E7NwcosVqbInZVLTp8QBA8';
  // -----------------------------------------------------------------------

  var isConfigured =
    SUPABASE_URL.indexOf('YOUR-PROJECT-REF') === -1 &&
    SUPABASE_ANON_KEY.indexOf('YOUR-SUPABASE-ANON-PUBLIC-KEY') === -1;

  global.DRAFTZENN_SUPABASE_CONFIGURED = isConfigured;

  /**
   * Session readiness gate + cache
   * ---------------------------------------------------------------------
   * On a fresh page load, Supabase restores any persisted session from
   * storage asynchronously. Calling `auth.getSession()` from more than one
   * place at once (e.g. nav.js and dashboard.js both run on
   * DOMContentLoaded) can race that restore and intermittently see no
   * session yet, which is what caused the login → dashboard → login
   * redirect loop.
   *
   * `onAuthStateChange` fires exactly once as soon as that restore
   * finishes (with the current session, or null if signed out), and again
   * on every future sign-in/sign-out/token refresh. Using it as the single
   * source of truth — instead of every provider independently calling
   * getSession() — guarantees everyone reads the same, fully-initialized
   * state, and that state keeps itself current across token refreshes.
   *
   * global.DRAFTZENN_AUTH_READY   -> Promise, resolves once the initial
   *                                  session restore has completed
   * global.DRAFTZENN_LATEST_SESSION -> the current session object, or null
   *                                     (undefined until ready)
   */
  var resolveAuthReady;
  global.DRAFTZENN_AUTH_READY = new Promise(function (resolve) {
    resolveAuthReady = resolve;
  });
  global.DRAFTZENN_LATEST_SESSION = undefined;

  if (isConfigured && global.supabase && typeof global.supabase.createClient === 'function') {
    // global.supabase here is the library loaded via the CDN <script> tag.
    global.supabaseClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    global.supabaseClient.auth.onAuthStateChange(function (_event, session) {
      // TEMP DEBUG — remove once the redirect issue is confirmed fixed.
      console.log('[Draftzenn][debug] onAuthStateChange:', _event, session ? ('session for ' + session.user.email) : 'no session');
      global.DRAFTZENN_LATEST_SESSION = session || null;
      resolveAuthReady();
    });
  } else {
    global.supabaseClient = null;
    global.DRAFTZENN_LATEST_SESSION = null;
    resolveAuthReady();

    if (!isConfigured) {
      console.warn(
        '[Draftzenn] Supabase is not configured yet. Add your project URL and anon key ' +
        'in js/supabase-config.js before using Sign Up / Login.'
      );
    } else {
      console.error(
        '[Draftzenn] The Supabase JS library did not load. Check that the ' +
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"> tag is present ' +
        'and loads before js/supabase-config.js.'
      );
    }
  }
})(window);
