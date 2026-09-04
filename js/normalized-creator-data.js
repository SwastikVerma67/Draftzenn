/**
 * Draftzenn — Normalized Creator Data (foundation)
 * ---------------------------------------------------------------------------
 * FOUNDATION ONLY. This file does not fetch anything from the internet, call
 * any platform API, perform OAuth, or create any connected-account state.
 * It only defines (a) one common internal shape for a piece of creator
 * content/performance data, and (b) a small adapter per platform that can
 * convert that platform's *raw* data (today: hand-written mock/sample
 * objects only) into that common shape.
 *
 * Nothing in the app calls this module yet — it exists so that when real
 * YouTube / Instagram / TikTok integrations are built later, they each only
 * need to (1) fetch their own raw data and (2) hand it to their adapter
 * here. Everything downstream (Content History, Creator Performance,
 * Creator Learning, Creator Radar) can then be taught to read the one
 * shape below instead of three different platform-specific shapes.
 *
 * ---------------------------------------------------------------------------
 * NORMALIZED CONTENT RECORD SHAPE
 * ---------------------------------------------------------------------------
 *   {
 *     platform:     'youtube' | 'instagram' | 'tiktok',
 *     contentId:    string | null,   // the platform's own id for this post
 *     title:        string | null,   // title, caption, or topic text
 *     format:       string | null,   // e.g. 'video', 'short', 'reel', 'post', 'carousel', 'story'
 *     publishDate:  string | null,   // ISO 8601 date/time string, or null if unknown
 *     views:        number | null,
 *     likes:        number | null,
 *     comments:     number | null,
 *     shares:       number | null,
 *     url:          string | null,   // link to the content, when available
 *     source:       string,          // where this record came from, e.g. 'youtube_api', 'mock'
 *     importedAt:   string           // ISO timestamp of when this record was normalized
 *   }
 *
 * Every field is always present on a normalized record. When a platform
 * doesn't provide a given field (or a real integration hasn't supplied it
 * yet), the adapter fills it with `null` rather than omitting the key —
 * this keeps the shape identical and predictable no matter which platform
 * or adapter produced the record.
 *
 * ---------------------------------------------------------------------------
 * FUTURE PIPELINE (not implemented — documented for the next integration)
 * ---------------------------------------------------------------------------
 *   Platform API (YouTube / Instagram / TikTok)
 *     -> Platform Adapter                  (this file: raw -> normalized)
 *     -> Normalized Creator Data           (this file: the shape above)
 *     -> Content History / Creator Performance
 *                                           (js/content-history-data.js,
 *                                            js/performance-data.js)
 *     -> Creator Learning                  (js/creator-learning.js)
 *     -> Creator Radar scoring             (js/radar-scoring.js)
 *
 * This file only owns the first two boxes: converting one platform's raw
 * record into the shared shape. It does not write to Content History,
 * Creator Performance, Creator Learning, or Creator Radar, and it does not
 * replace or duplicate any of those existing systems. Wiring a normalized
 * record into any of them is a separate, future change.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var PLATFORM_IDS = {
    YOUTUBE: 'youtube',
    INSTAGRAM: 'instagram',
    TIKTOK: 'tiktok'
  };

  function toNumberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    var n = Number(value);
    return isNaN(n) ? null : n;
  }

  function toStringOrNull(value) {
    if (value === null || value === undefined) return null;
    var str = String(value).trim();
    return str === '' ? null : str;
  }

  /**
   * Builds one normalized record. Every adapter below funnels through this
   * so the resulting shape (and its null-handling) is identical no matter
   * which platform it came from.
   */
  function makeNormalizedRecord(fields) {
    fields = fields || {};
    return {
      platform: toStringOrNull(fields.platform),
      contentId: toStringOrNull(fields.contentId),
      title: toStringOrNull(fields.title),
      format: toStringOrNull(fields.format),
      publishDate: toStringOrNull(fields.publishDate),
      views: toNumberOrNull(fields.views),
      likes: toNumberOrNull(fields.likes),
      comments: toNumberOrNull(fields.comments),
      shares: toNumberOrNull(fields.shares),
      url: toStringOrNull(fields.url),
      source: toStringOrNull(fields.source) || 'unknown',
      importedAt: new Date().toISOString()
    };
  }

  /**
   * ---------------------------------------------------------------------
   * YouTube adapter
   * ---------------------------------------------------------------------
   * Expects raw data shaped roughly like a YouTube Data API "video"
   * resource (id, snippet.title, snippet.publishedAt, statistics.*).
   * Only ever accepts a plain JS object passed in by the caller — never
   * fetches anything itself.
   */
  function normalizeYouTubeRecord(raw) {
    raw = raw || {};
    var snippet = raw.snippet || {};
    var statistics = raw.statistics || {};

    return makeNormalizedRecord({
      platform: PLATFORM_IDS.YOUTUBE,
      contentId: raw.id,
      title: snippet.title,
      format: raw.isShort ? 'short' : 'video',
      publishDate: snippet.publishedAt,
      views: statistics.viewCount,
      likes: statistics.likeCount,
      comments: statistics.commentCount,
      shares: statistics.shareCount,
      url: raw.id ? 'https://www.youtube.com/watch?v=' + raw.id : null,
      source: raw.source || 'youtube_mock'
    });
  }

  /**
   * ---------------------------------------------------------------------
   * Instagram adapter
   * ---------------------------------------------------------------------
   * Expects raw data shaped roughly like a Graph API "media" object
   * (id, caption, media_type, timestamp, like_count, comments_count).
   * Instagram's public APIs don't expose a view or share count for every
   * media type, so those default to null unless the caller supplies them.
   */
  function normalizeInstagramRecord(raw) {
    raw = raw || {};

    return makeNormalizedRecord({
      platform: PLATFORM_IDS.INSTAGRAM,
      contentId: raw.id,
      title: raw.caption,
      format: (raw.media_type || '').toLowerCase() || null,
      publishDate: raw.timestamp,
      views: raw.play_count,
      likes: raw.like_count,
      comments: raw.comments_count,
      shares: raw.share_count,
      url: raw.permalink,
      source: raw.source || 'instagram_mock'
    });
  }

  /**
   * ---------------------------------------------------------------------
   * TikTok adapter
   * ---------------------------------------------------------------------
   * Expects raw data shaped roughly like a TikTok Display API "video"
   * object (id, video_description, create_time, view_count, like_count,
   * comment_count, share_count, share_url).
   */
  function normalizeTikTokRecord(raw) {
    raw = raw || {};

    return makeNormalizedRecord({
      platform: PLATFORM_IDS.TIKTOK,
      contentId: raw.id,
      title: raw.video_description,
      format: 'video',
      publishDate: normalizeTikTokTimestamp(raw.create_time),
      views: raw.view_count,
      likes: raw.like_count,
      comments: raw.comment_count,
      shares: raw.share_count,
      url: raw.share_url,
      source: raw.source || 'tiktok_mock'
    });
  }

  /** TikTok's create_time is Unix seconds; normalize it to an ISO string. */
  function normalizeTikTokTimestamp(unixSeconds) {
    if (unixSeconds === null || unixSeconds === undefined || unixSeconds === '') return null;
    var n = Number(unixSeconds);
    if (isNaN(n)) return null;
    var date = new Date(n * 1000);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  /**
   * Runs a whole array of raw records for one platform through that
   * platform's adapter. Convenience only — equivalent to mapping the
   * single-record adapter yourself.
   */
  function normalizeMany(platformId, rawList) {
    var adapter = ADAPTERS[platformId];
    if (!adapter || !Array.isArray(rawList)) return [];
    return rawList.map(adapter);
  }

  var ADAPTERS = {};
  ADAPTERS[PLATFORM_IDS.YOUTUBE] = normalizeYouTubeRecord;
  ADAPTERS[PLATFORM_IDS.INSTAGRAM] = normalizeInstagramRecord;
  ADAPTERS[PLATFORM_IDS.TIKTOK] = normalizeTikTokRecord;

  /**
   * Public facade — this is what a future integration would call.
   * Nothing in the app calls this yet.
   */
  var DraftzennNormalizedData = {
    PLATFORM_IDS: PLATFORM_IDS,

    /** Converts one raw record from a given platform into the shared shape. */
    normalize: function (platformId, raw) {
      var adapter = ADAPTERS[platformId];
      if (!adapter) return null;
      return adapter(raw);
    },

    normalizeMany: normalizeMany,

    // Exposed individually too, in case a future integration wants to call
    // a specific platform's adapter directly rather than by id.
    normalizeYouTubeRecord: normalizeYouTubeRecord,
    normalizeInstagramRecord: normalizeInstagramRecord,
    normalizeTikTokRecord: normalizeTikTokRecord
  };

  global.DraftzennNormalizedData = DraftzennNormalizedData;
})(window);
