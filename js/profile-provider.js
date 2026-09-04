/**
 * Draftzenn — Creator Profile Provider
 * ---------------------------------------------------------------------------
 * The ONE interface the rest of the app uses to read/write a creator's
 * onboarding profile (name, platform, niche, content type). Every screen
 * calls `DraftzennProfile.*` and never talks to Supabase directly — mirrors
 * the pattern in js/auth-provider.js so the two stay consistent.
 *
 * Backed by the `public.creator_profiles` table (see sql/creator_profiles.sql
 * for the table + Row Level Security policies). RLS guarantees a user can
 * only ever read or write their own row, but this layer also always scopes
 * queries by the current user's id as a defense-in-depth measure.
 *
 * Provider contract (all methods return Promises):
 *   getProfile()      -> resolves a Profile object, or null if the user
 *                         hasn't completed onboarding yet
 *   saveProfile(data)  -> upserts { creatorName, platform, niche, contentType }
 *                         for the current user, resolves the saved Profile
 *
 * Profile object shape:
 *   {
 *     userId: string,
 *     creatorName: string,
 *     platform: 'YouTube' | 'Instagram' | 'TikTok' | 'Other',
 *     niche: 'Gaming' | 'Tech' | 'Education' | 'Fitness' | 'Entertainment' |
 *            'Finance' | 'Lifestyle' | 'Other',
 *     contentType: 'Shorts/Reels' | 'Long-form' | 'Both' | 'Other',
 *     createdAt: string,
 *     updatedAt: string
 *   }
 *
 * "Onboarded yet?" is derived from whether getProfile() resolves a row at
 * all (null = not onboarded) — there's no separate completed flag column.
 *
 * This data is exactly what Creator Radar will later read to personalize
 * opportunities — keep the shape stable, add fields rather than renaming.
 *
 * Load order matters (same as auth):
 *   1. Supabase JS library (CDN <script>)
 *   2. js/supabase-config.js       (creates window.supabaseClient)
 *   3. js/supabase-auth-provider.js + js/auth-provider.js
 *   4. js/profile-provider.js      (this file)
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var TABLE = 'creator_profiles';

  var NOT_CONFIGURED_MESSAGE =
    'Profiles aren\u2019t set up yet. Add your Supabase URL and anon key in js/supabase-config.js.';

  function SupabaseProfileProvider() {
    this.client = global.supabaseClient || null;
  }

  SupabaseProfileProvider.prototype._requireClient = function () {
    if (!this.client) {
      return Promise.reject(new Error(NOT_CONFIGURED_MESSAGE));
    }
    return null;
  };

  SupabaseProfileProvider.prototype._currentUserId = function () {
    var ready = global.DRAFTZENN_AUTH_READY || Promise.resolve();

    // Same fix as getCurrentUser() in supabase-auth-provider.js: read the
    // gated, cached session instead of racing an independent getSession()
    // call against the initial restore-from-storage on page load.
    return ready.then(function () {
      var session = global.DRAFTZENN_LATEST_SESSION;
      var user = session ? session.user : null;
      if (!user) {
        console.warn('[Draftzenn][debug] profile-provider: _currentUserId found no session/user.');
        throw new Error('You need to be signed in to do that.');
      }
      return user.id;
    });
  };

  SupabaseProfileProvider.prototype._mapRow = function (row) {
    if (!row) return null;
    return {
      userId: row.user_id,
      creatorName: row.creator_name,
      platform: row.platform,
      niche: row.niche,
      contentType: row.content_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  };

  SupabaseProfileProvider.prototype._friendlyError = function (error) {
    var msg = (error && error.message) || 'Something went wrong. Please try again.';
    var lower = msg.toLowerCase();

    if (lower.indexOf('failed to fetch') !== -1 || lower.indexOf('network') !== -1) {
      return 'Couldn\u2019t reach the server. Check your connection and try again.';
    }
    if (lower.indexOf('row-level security') !== -1 || lower.indexOf('permission denied') !== -1) {
      return 'You don\u2019t have permission to do that.';
    }
    return msg;
  };

  /**
   * Fetches the current user's profile. Resolves `null` (not an error) when
   * the user is authenticated but hasn't completed onboarding yet — callers
   * use that to decide whether to show the onboarding screen.
   */
  SupabaseProfileProvider.prototype.getProfile = function () {
    var blocked = this._requireClient();
    if (blocked) return blocked;

    var self = this;
    return this._currentUserId().then(function (userId) {
      return self.client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
        .then(function (result) {
          if (result.error) {
            // TEMP DEBUG — remove once the redirect issue is confirmed fixed.
            // Logging the RAW Supabase error (not the friendly-ified one)
            // because the message/code here usually says exactly what's
            // wrong, e.g. "relation \"public.creator_profiles\" does not
            // exist" (sql/creator_profiles.sql hasn't been run yet) or a
            // row-level-security violation (policy doesn't match).
            console.error('[Draftzenn][debug] profile-provider: getProfile query error:', result.error);
            throw new Error(self._friendlyError(result.error));
          }
          return self._mapRow(result.data);
        });
    });
  };

  /**
   * Creates or updates the current user's profile (upsert on user_id).
   */
  SupabaseProfileProvider.prototype.saveProfile = function (data) {
    var blocked = this._requireClient();
    if (blocked) return blocked;

    var self = this;
    return this._currentUserId().then(function (userId) {
      var row = {
        user_id: userId,
        creator_name: (data.creatorName || '').trim(),
        platform: data.platform,
        niche: data.niche,
        content_type: data.contentType
      };

      return self.client
        .from(TABLE)
        .upsert(row, { onConflict: 'user_id' })
        .select('*')
        .single()
        .then(function (result) {
          if (result.error) {
            throw new Error(self._friendlyError(result.error));
          }
          return self._mapRow(result.data);
        });
    });
  };

  /**
   * Public facade — this is what every page calls.
   */
  var DraftzennProfile = {
    _provider: null,

    configure: function (provider) {
      this._provider = provider;
    },

    getProfile: function () {
      return this._provider.getProfile();
    },

    saveProfile: function (data) {
      return this._provider.saveProfile(data);
    }
  };

  DraftzennProfile.configure(new SupabaseProfileProvider());

  global.DraftzennProfile = DraftzennProfile;
})(window);
