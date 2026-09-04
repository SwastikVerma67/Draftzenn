/**
 * Draftzenn — Platform Connections (foundation)
 * ---------------------------------------------------------------------------
 * FOUNDATION ONLY. No real OAuth, no API calls, no credentials of any kind
 * are handled here or anywhere in this file. Every platform is, and stays,
 * "not_connected" until a real integration is built.
 *
 * This module defines ONE clean interface (`DraftzennPlatformConnections`)
 * for platform-connection state, mirroring how js/auth-provider.js and
 * js/performance-data.js are structured: every screen calls
 * `DraftzennPlatformConnections.*` and gets Promises back, never reads
 * localStorage or a future API directly. When a real platform integration
 * exists, only the provider implementation below needs to change.
 *
 * Supported states (see CONNECTION_STATES):
 *   not_connected — default and only state reachable today.
 *   connected     — reserved for when OAuth actually completes.
 *   syncing       — reserved for when a background import is running.
 *   error         — reserved for when a connection or sync fails.
 *
 * Record shape (per platform, per creator):
 *   {
 *     platformId: 'youtube' | 'instagram' | 'tiktok',
 *     name: string,
 *     status: one of CONNECTION_STATES,
 *     connectedAt: string (ISO) | null,
 *     lastSyncedAt: string (ISO) | null,
 *     error: string | null
 *   }
 *
 * ---------------------------------------------------------------------------
 * FUTURE DATA FLOW (not implemented — documented so the next integration
 * slots in without a redesign):
 *
 *   Platform API
 *     -> connected creator data                 (this module: status -> 'connected')
 *     -> normalized content/performance data     (a future js/platform-sync.js)
 *     -> Content History / Creator Performance    (js/content-history-data.js,
 *                                                   js/performance-data.js)
 *     -> Creator Learning                         (js/creator-learning.js)
 *     -> Creator Radar scoring                    (js/radar-scoring.js)
 *
 * Each arrow above is a future, separate change. This file only owns the
 * left-most box: knowing which platforms a creator has connected, and what
 * state that connection is in. It does not fetch, store, or normalize any
 * platform content or performance data.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var CONNECTION_STATES = {
    NOT_CONNECTED: 'not_connected',
    CONNECTED: 'connected',
    SYNCING: 'syncing',
    ERROR: 'error'
  };

  var PLATFORMS = [
    { id: 'youtube', name: 'YouTube' },
    { id: 'instagram', name: 'Instagram' },
    { id: 'tiktok', name: 'TikTok' }
  ];

  var STORAGE_KEY = 'draftzenn_platform_connections_v1';
  var CHANGE_EVENT = 'draftzenn:platform-connections-changed';

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
      // localStorage unavailable — state just won't persist this session.
    }
  }

  function emitChange() {
    try {
      document.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch (e) {
      // no-op on environments without CustomEvent support
    }
  }

  function defaultRecord(platform) {
    return {
      platformId: platform.id,
      name: platform.name,
      status: CONNECTION_STATES.NOT_CONNECTED,
      connectedAt: null,
      lastSyncedAt: null,
      error: null
    };
  }

  /**
   * LocalPlatformConnectionsProvider
   * -----------------------------------------------------------------------
   * Same shape as LocalPerformanceProvider (js/performance-data.js): scopes
   * everything by the signed-in creator's id. Today every read simply
   * returns the default not_connected record for each of the three
   * platforms — there is no code path anywhere that sets a platform to
   * 'connected'. The per-user store exists so that when a real integration
   * lands, persisting its state is a small addition here, not a rebuild.
   */
  function LocalPlatformConnectionsProvider() {}

  LocalPlatformConnectionsProvider.prototype._currentUserId = function () {
    if (!global.DraftzennAuth) {
      return Promise.reject(new Error('You need to be signed in to do that.'));
    }
    return global.DraftzennAuth.getCurrentUser().then(function (user) {
      if (!user) throw new Error('You need to be signed in to do that.');
      return user.id;
    });
  };

  /**
   * Resolves the current creator's connection record for every known
   * platform (YouTube, Instagram, TikTok), in a stable order. Platforms
   * with no saved record yet default to not_connected.
   */
  LocalPlatformConnectionsProvider.prototype.getConnections = function () {
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      var userRecords = store[userId] || {};

      return PLATFORMS.map(function (platform) {
        return userRecords[platform.id] || defaultRecord(platform);
      });
    });
  };

  LocalPlatformConnectionsProvider.prototype.getConnection = function (platformId) {
    return this.getConnections().then(function (records) {
      var match = records.filter(function (r) { return r.platformId === platformId; })[0];
      return match || null;
    });
  };

  var provider = new LocalPlatformConnectionsProvider();

  /**
   * Public facade — this is what every page calls.
   */
  var DraftzennPlatformConnections = {
    STATES: CONNECTION_STATES,

    /** The platforms Draftzenn knows about, in display order. */
    listPlatforms: function () {
      return PLATFORMS.slice();
    },

    /** Resolves an array of connection records, one per known platform. */
    getConnections: function () {
      return provider.getConnections();
    },

    /** Resolves a single platform's connection record, or null. */
    getConnection: function (platformId) {
      return provider.getConnection(platformId);
    },

    /**
     * Called when a creator clicks "Connect" on a platform.
     *
     * YouTube (Prompt 20): delegates to the real implementation in
     * js/youtube-integration.js, which redirects the browser into Google's
     * OAuth consent flow. This module itself still does not handle any
     * OAuth or credentials — it only routes the click.
     *
     * Instagram / TikTok: unchanged placeholder — resolves so the calling
     * UI can show a "coming soon" message. No real integration exists for
     * these yet.
     */
    requestConnect: function (platformId) {
      if (platformId === 'youtube' && global.DraftzennYouTubeIntegration) {
        return global.DraftzennYouTubeIntegration.connect();
      }
      return Promise.resolve({ platformId: platformId, implemented: false });
    },

    onChange: onChange,
    CHANGE_EVENT: CHANGE_EVENT
  };

  function onChange(callback) {
    if (typeof callback !== 'function') return;
    document.addEventListener(CHANGE_EVENT, callback);
  }

  global.DraftzennPlatformConnections = DraftzennPlatformConnections;
})(window);
