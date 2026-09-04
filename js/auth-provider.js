/**
 * Draftzenn — Auth Provider Layer
 * ---------------------------------------------------------------------------
 * This file defines the ONE interface the rest of the app talks to for
 * authentication. Every screen (signup.html, login.html, the nav) calls
 * `DraftzennAuth.*` and never touches a specific backend directly.
 *
 * To connect a real backend later (custom API, Firebase, Supabase, Auth0,
 * etc.), write a new provider object that implements the same four methods
 * as MockAuthProvider below, then swap it in at the bottom of this file:
 *
 *     DraftzennAuth.configure(new MyRealProvider());
 *
 * No other file needs to change.
 *
 * Provider contract (all methods return Promises):
 *   signUp({ name, email, password })  -> resolves { id, name, email }
 *   logIn({ email, password })         -> resolves { id, name, email }
 *   logOut()                           -> resolves undefined
 *   getCurrentUser()                   -> resolves { id, name, email } | null
 *
 * Providers should throw an Error with a human-readable `.message` on
 * failure (e.g. "Invalid email or password.") — the UI displays it as-is.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  /**
   * MockAuthProvider
   * -----------------------------------------------------------------------
   * A placeholder implementation so the UI is fully functional before a
   * real backend exists. Stores users in localStorage in PLAIN TEXT.
   *
   * THIS IS NOT SECURE AND IS NOT FOR PRODUCTION. It exists only so the
   * sign up / login / logout flows can be built, tested, and demoed end
   * to end. Delete this class (or stop configuring it) once a real
   * provider is wired in.
   */
  function MockAuthProvider() {
    this.usersKey = 'draftzenn_mock_users';
    this.sessionKey = 'draftzenn_mock_session';
    this.networkDelay = 500;
  }

  MockAuthProvider.prototype._readUsers = function () {
    try {
      return JSON.parse(localStorage.getItem(this.usersKey)) || {};
    } catch (e) {
      return {};
    }
  };

  MockAuthProvider.prototype._writeUsers = function (users) {
    localStorage.setItem(this.usersKey, JSON.stringify(users));
  };

  MockAuthProvider.prototype._delay = function (fn) {
    var self = this;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          resolve(fn());
        } catch (err) {
          reject(err);
        }
      }, self.networkDelay);
    });
  };

  MockAuthProvider.prototype.signUp = function (data) {
    var self = this;
    return this._delay(function () {
      var email = data.email.trim().toLowerCase();
      var users = self._readUsers();

      if (users[email]) {
        throw new Error('An account with this email already exists.');
      }

      var user = { id: 'u_' + Date.now(), name: data.name.trim(), email: email };
      users[email] = { user: user, password: data.password };
      self._writeUsers(users);
      localStorage.setItem(self.sessionKey, JSON.stringify(user));
      return user;
    });
  };

  MockAuthProvider.prototype.logIn = function (data) {
    var self = this;
    return this._delay(function () {
      var email = data.email.trim().toLowerCase();
      var users = self._readUsers();
      var record = users[email];

      if (!record || record.password !== data.password) {
        throw new Error('Invalid email or password.');
      }

      localStorage.setItem(self.sessionKey, JSON.stringify(record.user));
      return record.user;
    });
  };

  MockAuthProvider.prototype.logOut = function () {
    var self = this;
    return this._delay(function () {
      localStorage.removeItem(self.sessionKey);
    });
  };

  MockAuthProvider.prototype.getCurrentUser = function () {
    try {
      var raw = localStorage.getItem(this.sessionKey);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return Promise.resolve(null);
    }
  };

  /**
   * Public facade — this is what every page calls.
   */
  var DraftzennAuth = {
    _provider: null,

    configure: function (provider) {
      this._provider = provider;
    },

    signUp: function (data) {
      return this._provider.signUp(data);
    },

    logIn: function (data) {
      return this._provider.logIn(data);
    },

    logOut: function () {
      return this._provider.logOut();
    },

    getCurrentUser: function () {
      return this._provider.getCurrentUser();
    }
  };

  // Live: wired to Supabase Auth (see js/supabase-auth-provider.js and
  // js/supabase-config.js for credentials). To go back to the offline mock
  // for UI-only testing, swap the line below for:
  //   DraftzennAuth.configure(new MockAuthProvider());
  DraftzennAuth.configure(new SupabaseAuthProvider());

  global.DraftzennAuth = DraftzennAuth;
})(window);
