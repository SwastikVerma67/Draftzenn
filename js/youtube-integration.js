/**
 * Draftzenn — YouTube Integration (real OAuth + sync)
 * ---------------------------------------------------------------------------
 * Talks ONLY to Draftzenn's own backend boundary (/api/youtube/*) and to
 * Supabase (for the signed-in creator's session token and for reading the
 * non-secret `youtube_connections` row directly). It NEVER talks to Google
 * directly and NEVER handles a Google client secret, refresh token, or
 * Supabase service-role key — those live only in the server-side /api
 * functions (see /api/youtube/*.js and sql/youtube_connections.sql).
 *
 * Real flow:
 *
 *   Creator clicks Connect (connected-platforms.js)
 *     -> connect() posts to /api/youtube/connect with the creator's own
 *        Supabase access token, gets back a Google consent URL, and
 *        navigates the browser there
 *     -> Google OAuth consent (YouTube read-only scope only)
 *     -> /api/youtube/callback exchanges the code for tokens server-side,
 *        fetches the channel, stores metadata + tokens in Supabase
 *     -> browser lands back on connected-platforms.html?youtube=connected
 *     -> sync() posts to /api/youtube/sync (creator's session token only)
 *        and gets back RAW YouTube API video resources
 *     -> importRawVideos() hands those to the SAME normalizer Prompt 18
 *        already built: DraftzennNormalizedData.normalizeYouTubeRecord()
 *                                                 (js/normalized-creator-data.js
 *                                                  — reused as-is, never
 *                                                  duplicated)
 *     -> normalized creator data
 *     -> js/connected-platforms.js hands the normalized records to
 *        DraftzennHistory.importRecords() (js/content-history-data.js),
 *        additive + clearly tagged as imported — see that file's docs.
 *        Performance / Learning / Radar / Content Plan are untouched.
 *
 * Relationship to js/platform-connections.js:
 *   platform-connections.js still owns generic per-platform status
 *   (Instagram/TikTok stay exactly as before — "coming soon"). For
 *   YouTube specifically, the source of truth for connection status is
 *   now the `youtube_connections` Supabase row (read here via
 *   getConnectionStatus()), because it reflects what the backend actually
 *   did, not a local guess. platform-connections.js's requestConnect()
 *   delegates to this file's connect() for the 'youtube' platform id only.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  /**
   * ---------------------------------------------------------------------
   * 1. Sync states
   * ---------------------------------------------------------------------
   * The full set of states a real YouTube integration will eventually move
   * through. Today, and until a real OAuth flow is implemented, the actual
   * state is permanently YOUTUBE_SYNC_STATES.NOT_CONNECTED — nothing in
   * this file (or anywhere else) ever sets it to anything else.
   */
  var YOUTUBE_SYNC_STATES = {
    NOT_CONNECTED: 'not_connected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    ERROR: 'error'
  };

  /** Fixed today. Do not change without shipping a real OAuth integration. */
  var CURRENT_STATE = YOUTUBE_SYNC_STATES.NOT_CONNECTED;

  /**
   * ---------------------------------------------------------------------
   * 2. The data Draftzenn actually needs from YouTube
   * ---------------------------------------------------------------------
   * Deliberately minimal — only what Creator Radar, Creator Learning,
   * Content History, and Creator Performance can use today. Nothing here
   * is fetched; these are field lists a future implementation reads from
   * the YouTube Data API's `channels` and `videos` resources.
   */
  var CHANNEL_FIELDS = [
    'channelId',        // channels.list -> id
    'channelName',      // channels.list -> snippet.title
    'channelUrl',       // derived: https://www.youtube.com/channel/{channelId}
    'subscriberCount',  // channels.list -> statistics.subscriberCount (if not hidden)
    'totalViews'        // channels.list -> statistics.viewCount
  ];

  var VIDEO_FIELDS = [
    'videoId',      // videos.list -> id
    'title',        // videos.list -> snippet.title
    'publishDate',  // videos.list -> snippet.publishedAt
    'format',       // derived where determinable, e.g. 'video' | 'short'
    'views',        // videos.list -> statistics.viewCount
    'likes',        // videos.list -> statistics.likeCount
    'comments',     // videos.list -> statistics.commentCount
    'url'           // derived: https://www.youtube.com/watch?v={videoId}
  ];

  /**
   * ---------------------------------------------------------------------
   * 3. Import pipeline (future entry point — not wired to anything yet)
   * ---------------------------------------------------------------------
   * Once real OAuth + API calls exist elsewhere, that future code will call
   * `importRawVideos(rawVideoList)` with whatever the YouTube Data API
   * `videos.list` response contains. This function does exactly one thing:
   * hands each raw item to the SAME normalizer Prompt 18 already built
   * (DraftzennNormalizedData.normalizeYouTubeRecord), so there is only ever
   * one YouTube normalization code path in the app. It never fetches
   * anything itself, never stores anything, and never calls Content
   * History, Performance, Creator Learning, or Creator Radar directly —
   * wiring the resulting normalized records into those systems is a
   * separate, later change (see the flow diagram at the top of this file).
   */
  function importRawVideos(rawVideoList) {
    if (!global.DraftzennNormalizedData) {
      throw new Error('DraftzennNormalizedData is required to normalize YouTube data.');
    }
    if (!Array.isArray(rawVideoList)) return [];

    return global.DraftzennNormalizedData.normalizeMany(
      global.DraftzennNormalizedData.PLATFORM_IDS.YOUTUBE,
      rawVideoList
    );
  }

  /**
   * ---------------------------------------------------------------------
   * 4. Backend boundary calls
   * ---------------------------------------------------------------------
   * Every call below sends ONLY the creator's own Supabase access token
   * (the same one js/supabase-config.js already holds client-side for
   * every other Supabase-backed feature) — never a Google credential,
   * never a Supabase service-role key. If /api isn't deployed yet (e.g.
   * this static site hasn't had the serverless boundary set up), these
   * fail with a clear "not configured" error instead of pretending to
   * succeed.
   */

  var NOT_CONFIGURED_MESSAGE =
    'YouTube connection isn\u2019t set up on this deployment yet \u2014 it needs the ' +
    '/api/youtube backend boundary (see sql/youtube_connections.sql and .env.example).';

  function getAccessToken() {
    if (!global.supabaseClient) {
      return Promise.reject(new Error('You need to be signed in to do that.'));
    }
    return global.supabaseClient.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      if (!session || !session.access_token) {
        throw new Error('You need to be signed in to do that.');
      }
      return session.access_token;
    });
  }

  function apiCall(path, options) {
    return getAccessToken().then(function (token) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['Authorization'] = 'Bearer ' + token;
      return fetch(path, options).then(function (res) {
        if (res.status === 404) {
          throw new Error(NOT_CONFIGURED_MESSAGE);
        }
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) {
            throw new Error(body.error || 'Something went wrong. Please try again.');
          }
          return body;
        });
      });
    }).catch(function (err) {
      if (err instanceof TypeError) {
        // fetch() network failure — most commonly means /api isn't deployed.
        throw new Error(NOT_CONFIGURED_MESSAGE);
      }
      throw err;
    });
  }

  /**
   * Reads the creator's current YouTube connection directly from the
   * `youtube_connections` Supabase table. Safe to read straight from the
   * frontend: that table holds no tokens, and Row Level Security scopes
   * every row to auth.uid() = user_id (see sql/youtube_connections.sql).
   * Resolves a not_connected default shape if the migration hasn't been
   * run yet or the creator has no row.
   */
  function getConnectionStatus() {
    if (!global.supabaseClient || !global.DraftzennAuth) {
      return Promise.resolve(defaultConnectionRecord());
    }
    return global.DraftzennAuth.getCurrentUser().then(function (user) {
      if (!user) return defaultConnectionRecord();
      return global.supabaseClient
        .from('youtube_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(function (result) {
          if (result.error || !result.data) return defaultConnectionRecord();
          return result.data;
        });
    }).catch(function () {
      return defaultConnectionRecord();
    });
  }

  function defaultConnectionRecord() {
    return {
      status: YOUTUBE_SYNC_STATES.NOT_CONNECTED,
      channel_id: null,
      channel_name: null,
      channel_url: null,
      subscriber_count: null,
      total_views: null,
      connected_at: null,
      last_synced_at: null,
      error: null
    };
  }

  /**
   * Starts the real Google OAuth flow: asks the backend for a consent
   * URL, then navigates the browser there. Resolves just before
   * navigating (mostly useful so a caller can catch a "not configured"
   * or "not signed in" error and show it instead of navigating).
   */
  function connect() {
    return apiCall('/api/youtube/connect', { method: 'POST' }).then(function (body) {
      if (!body.url) throw new Error(NOT_CONFIGURED_MESSAGE);
      global.location.href = body.url;
      return body;
    });
  }

  /**
   * Triggers a sync: backend fetches (new/updated) videos from the
   * YouTube Data API and returns them as raw API resources, which are
   * immediately normalized here via the existing normalizer and hung
   * off DraftzennHistory as additive, clearly-tagged imported records.
   * Resolves { importedCount, channel }.
   */
  function sync() {
    return apiCall('/api/youtube/sync', { method: 'POST' }).then(function (body) {
      var normalized = importRawVideos(body.videos || []);
      if (!global.DraftzennHistory || typeof global.DraftzennHistory.importRecords !== 'function') {
        return { importedCount: 0, channel: body.channel };
      }
      return global.DraftzennHistory.importRecords(normalized).then(function (result) {
        return { importedCount: result.addedCount, channel: body.channel };
      });
    });
  }

  /** Disconnects: revokes the Google token and clears stored connection state. */
  function disconnect() {
    return apiCall('/api/youtube/disconnect', { method: 'POST' });
  }

  /**
   * Mirrors DraftzennPlatformConnections.requestConnect's shape for
   * callers that still branch on platformId, but for YouTube this is now
   * the REAL entry point — it's what actually redirects to Google.
   */
  function requestConnect() {
    return connect();
  }

  /**
   * Public facade.
   */
  var DraftzennYouTubeIntegration = {
    SYNC_STATES: YOUTUBE_SYNC_STATES,
    CHANNEL_FIELDS: CHANNEL_FIELDS,
    VIDEO_FIELDS: VIDEO_FIELDS,

    /** Legacy convenience accessors — prefer getConnectionStatus() now. */
    getState: function () {
      return CURRENT_STATE;
    },
    isConnected: function () {
      return CURRENT_STATE === YOUTUBE_SYNC_STATES.CONNECTED ||
        CURRENT_STATE === YOUTUBE_SYNC_STATES.SYNCING ||
        CURRENT_STATE === YOUTUBE_SYNC_STATES.SYNCED;
    },

    importRawVideos: importRawVideos,
    requestConnect: requestConnect,
    getConnectionStatus: getConnectionStatus,
    connect: connect,
    sync: sync,
    disconnect: disconnect
  };

  global.DraftzennYouTubeIntegration = DraftzennYouTubeIntegration;
})(window);
