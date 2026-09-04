/**
 * Draftzenn — Creator Performance store
 * ---------------------------------------------------------------------------
 * DEMO / LOCAL-ONLY STORE (mirrors the pattern in js/plan-data.js).
 *
 * Lets a creator record what has historically worked for them — average
 * views/likes/comments/shares, posting cadence, and their best-performing
 * topic + format. Saved to localStorage, keyed by the current user's id, so
 * it survives refreshes and never leaks between accounts on a shared
 * browser.
 *
 * This is intentionally shaped like a provider (see js/profile-provider.js /
 * js/auth-provider.js): every screen calls `DraftzennPerformance.*` and gets
 * Promises back, never touches localStorage directly. When a real
 * `creator_performance` Supabase table exists, only this file needs to be
 * replaced with one backed by that table — nothing else changes.
 *
 * Record shape (all fields optional so partial saves are fine):
 *   {
 *     userId: string,
 *     avgViews: number | null,
 *     avgLikes: number | null,
 *     avgComments: number | null,
 *     avgShares: number | null,
 *     postsPerWeek: number | null,
 *     bestTopic: string,
 *     bestFormat: 'Shorts/Reels' | 'Long-form' | 'Both' | 'Other' | '',
 *     updatedAt: string (ISO)
 *   }
 *
 * ---------------------------------------------------------------------------
 * FOUNDATION FOR CREATOR RADAR (not wired up yet)
 * ---------------------------------------------------------------------------
 * getPerformanceSnapshot() below returns this same record trimmed to just
 * the fields a future opportunity-scoring pass would want (engagement rate,
 * cadence, best topic/format), with an `engagementRate` computed once,
 * consistently, in one place. Creator Radar (js/creator-radar.js) doesn't
 * read this yet — this only exists so that hookup is a small, well-defined
 * change later rather than a redesign.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'draftzenn_performance_v1';
  var CHANGE_EVENT = 'draftzenn:performance-changed';

  var NUMERIC_FIELDS = ['avgViews', 'avgLikes', 'avgComments', 'avgShares', 'postsPerWeek'];

  function readStore() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // localStorage unavailable (private browsing, quota, etc.) — the
      // record just won't persist across reloads this session.
    }
  }

  function emitChange() {
    try {
      document.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch (e) {
      // no-op on environments without CustomEvent support
    }
  }

  function toNumberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    var n = Number(value);
    return isNaN(n) ? null : n;
  }

  /**
   * LocalPerformanceProvider
   * -----------------------------------------------------------------------
   * Scopes every read/write by the signed-in user's id, same as
   * SupabaseProfileProvider does for creator_profiles — just against
   * localStorage instead of a table, since no Supabase table exists yet.
   */
  function LocalPerformanceProvider() {}

  LocalPerformanceProvider.prototype._currentUserId = function () {
    if (!global.DraftzennAuth) {
      return Promise.reject(new Error('You need to be signed in to do that.'));
    }
    return global.DraftzennAuth.getCurrentUser().then(function (user) {
      if (!user) throw new Error('You need to be signed in to do that.');
      return user.id;
    });
  };

  /**
   * Resolves the current user's saved performance record, or `null` if
   * they haven't entered anything yet.
   */
  LocalPerformanceProvider.prototype.getPerformance = function () {
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      return store[userId] || null;
    });
  };

  /**
   * Saves (creates or overwrites) the current user's performance record.
   * Numeric fields are coerced to numbers (or null if left blank);
   * bestTopic/bestFormat are trimmed strings. Resolves the saved record.
   */
  LocalPerformanceProvider.prototype.savePerformance = function (data) {
    data = data || {};
    return this._currentUserId().then(function (userId) {
      var record = { userId: userId };

      NUMERIC_FIELDS.forEach(function (field) {
        record[field] = toNumberOrNull(data[field]);
      });

      record.bestTopic = (data.bestTopic || '').trim();
      record.bestFormat = (data.bestFormat || '').trim();
      record.updatedAt = new Date().toISOString();

      var store = readStore();
      store[userId] = record;
      writeStore(store);
      emitChange();

      return record;
    });
  };

  function onChange(callback) {
    if (typeof callback !== 'function') return;
    document.addEventListener(CHANGE_EVENT, callback);
  }

  /**
   * Derives the small, stable subset of a performance record that a future
   * opportunity-scoring pass would consume — engagement rate computed once
   * here so every future caller agrees on the formula. Returns null if the
   * creator hasn't saved anything yet. Purely descriptive: no comparisons
   * over time, no growth or success claims, just this snapshot's numbers.
   */
  function toSnapshot(record) {
    if (!record) return null;

    var views = record.avgViews;
    var engagementTotal = [record.avgLikes, record.avgComments, record.avgShares]
      .filter(function (n) { return typeof n === 'number'; })
      .reduce(function (sum, n) { return sum + n; }, 0);

    var engagementRate = (typeof views === 'number' && views > 0)
      ? (engagementTotal / views) * 100
      : null;

    return {
      avgViews: views,
      postsPerWeek: record.postsPerWeek,
      bestTopic: record.bestTopic || '',
      bestFormat: record.bestFormat || '',
      engagementRate: engagementRate, // percent, or null if not computable
      updatedAt: record.updatedAt
    };
  }

  var provider = new LocalPerformanceProvider();

  /**
   * Public facade — this is what every page calls.
   */
  var DraftzennPerformance = {
    getPerformance: function () {
      return provider.getPerformance();
    },

    savePerformance: function (data) {
      return provider.savePerformance(data);
    },

    /**
     * Convenience helper: fetches the current user's record and returns it
     * already shaped via toSnapshot() (see comment above). Resolves null
     * if nothing has been saved yet.
     */
    getPerformanceSnapshot: function () {
      return provider.getPerformance().then(toSnapshot);
    },

    onChange: onChange,
    CHANGE_EVENT: CHANGE_EVENT
  };

  global.DraftzennPerformance = DraftzennPerformance;
})(window);
