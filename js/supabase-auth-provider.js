/**
 * Draftzenn — Supabase Auth Provider
 * ---------------------------------------------------------------------------
 * Real backend implementation of the DraftzennAuth provider contract
 * (see js/auth-provider.js), backed by Supabase Auth (email + password).
 *
 * This file only talks to `window.supabaseClient`, which is created in
 * js/supabase-config.js from your project URL + anon key. It never touches
 * any secret/service-role key.
 *
 * Load order matters:
 *   1. Supabase JS library (CDN <script>)
 *   2. js/supabase-config.js   (creates window.supabaseClient)
 *   3. js/supabase-auth-provider.js   (this file)
 *   4. js/auth-provider.js     (wires DraftzennAuth to this provider)
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  function SupabaseAuthProvider() {
    this.client = global.supabaseClient || null;
  }

  var NOT_CONFIGURED_MESSAGE =
    'Sign in isn\u2019t set up yet. Add your Supabase URL and anon key in js/supabase-config.js.';

  SupabaseAuthProvider.prototype._requireClient = function () {
    if (!this.client) {
      return Promise.reject(new Error(NOT_CONFIGURED_MESSAGE));
    }
    return null;
  };

  SupabaseAuthProvider.prototype._mapUser = function (supabaseUser) {
    if (!supabaseUser) return null;
    var meta = supabaseUser.user_metadata || {};
    return {
      id: supabaseUser.id,
      name: meta.name || supabaseUser.email,
      email: supabaseUser.email
    };
  };

  /**
   * Turns a raw Supabase AuthError into a short, human-readable message.
   * Falls back to the original message for anything we don't recognize.
   */
  SupabaseAuthProvider.prototype._friendlyError = function (error) {
    var msg = (error && error.message) || 'Something went wrong. Please try again.';
    var lower = msg.toLowerCase();

    if (lower.indexOf('already registered') !== -1 || lower.indexOf('already exists') !== -1) {
      return 'An account with this email already exists. Try logging in instead.';
    }
    if (lower.indexOf('invalid login credentials') !== -1) {
      return 'Invalid email or password.';
    }
    if (lower.indexOf('email not confirmed') !== -1) {
      return 'Please confirm your email address first \u2014 check your inbox for the confirmation link.';
    }
    if (lower.indexOf('password') !== -1 && lower.indexOf('at least') !== -1) {
      return msg; // Supabase's own "password must be at least N characters" is already clear.
    }
    if (lower.indexOf('rate limit') !== -1 || lower.indexOf('too many') !== -1) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (lower.indexOf('failed to fetch') !== -1 || lower.indexOf('network') !== -1) {
      return 'Couldn\u2019t reach the server. Check your connection and try again.';
    }
    return msg;
  };

  SupabaseAuthProvider.prototype.signUp = function (data) {
    var blocked = this._requireClient();
    if (blocked) return blocked;

    var self = this;
    var email = data.email.trim().toLowerCase();
    var name = data.name.trim();

    return this.client.auth
      .signUp({
        email: email,
        password: data.password,
        options: {
          data: { name: name }
        }
      })
      .then(function (result) {
        if (result.error) {
          throw new Error(self._friendlyError(result.error));
        }

        var user = result.data.user;
        var session = result.data.session;

        // Supabase's anti-enumeration behavior: signing up with an email that
        // already belongs to a confirmed account can return HTTP 200 with a
        // user object that has an empty `identities` array instead of an
        // error. Treat that the same as "account already exists".
        if (user && Array.isArray(user.identities) && user.identities.length === 0) {
          throw new Error('An account with this email already exists. Try logging in instead.');
        }

        return {
          id: user.id,
          name: name,
          email: user.email,
          // If email confirmation is required, Supabase creates the user but
          // does not return a session yet — there's nothing to log in with
          // until the user confirms via the emailed link.
          needsEmailConfirmation: !session
        };
      });
  };

  SupabaseAuthProvider.prototype.logIn = function (data) {
    var blocked = this._requireClient();
    if (blocked) return blocked;

    var self = this;
    var email = data.email.trim().toLowerCase();

    return this.client.auth
      .signInWithPassword({ email: email, password: data.password })
      .then(function (result) {
        if (result.error) {
          throw new Error(self._friendlyError(result.error));
        }
        return self._mapUser(result.data.user);
      });
  };

  SupabaseAuthProvider.prototype.logOut = function () {
    var blocked = this._requireClient();
    if (blocked) return blocked;

    var self = this;
    return this.client.auth.signOut().then(function (result) {
      if (result.error) {
        throw new Error(self._friendlyError(result.error));
      }
      return undefined;
    });
  };

  SupabaseAuthProvider.prototype.getCurrentUser = function () {
    if (!this.client) return Promise.resolve(null);

    var self = this;
    var ready = global.DRAFTZENN_AUTH_READY || Promise.resolve();

    // Wait for the one-time session restore (see js/supabase-config.js) so
    // this always reflects the fully-initialized session instead of racing
    // it — this is what fixes the login → dashboard → login redirect loop.
    return ready.then(function () {
      var session = global.DRAFTZENN_LATEST_SESSION;
      if (session !== undefined) {
        return self._mapUser(session ? session.user : null);
      }
      // Defensive fallback — shouldn't happen since the ready promise only
      // resolves after DRAFTZENN_LATEST_SESSION has been set.
      return self.client.auth.getSession().then(function (result) {
        var fallbackSession = result.data && result.data.session;
        return self._mapUser(fallbackSession ? fallbackSession.user : null);
      });
    }).catch(function () {
      return null;
    });
  };

  global.SupabaseAuthProvider = SupabaseAuthProvider;
})(window);
