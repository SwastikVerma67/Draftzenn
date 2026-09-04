/**
 * Draftzenn — Content History store
 * ---------------------------------------------------------------------------
 * DEMO / LOCAL-ONLY STORE (mirrors the pattern in js/performance-data.js and
 * js/plan-data.js).
 *
 * Lets a creator manually log content they've already published or tested —
 * topic, platform, format, publish date, and the raw engagement numbers
 * (views/likes/comments/shares). Saved to localStorage, keyed by the current
 * user's id, so records survive refreshes and never leak between accounts
 * on a shared browser.
 *
 * This is intentionally shaped like a provider: every screen calls
 * `DraftzennHistory.*` and gets Promises back, never touches localStorage
 * directly. When a real `content_history` Supabase table exists, only this
 * file needs to be replaced with one backed by that table — nothing else
 * changes.
 *
 * Record shape:
 *   {
 *     id: string,
 *     userId: string,
 *     topic: string,
 *     platform: 'YouTube' | 'Instagram' | 'TikTok' | 'Other',
 *     format: string,               // see FORMATS below
 *     publishDate: string,          // 'YYYY-MM-DD', or '' if not entered
 *     views: number | null,
 *     likes: number | null,
 *     comments: number | null,
 *     shares: number | null,
 *     createdAt: string (ISO),
 *     updatedAt: string (ISO) | undefined,
 *     sourceOpportunityId: string | null   // set when this record was
 *                                           // created/updated via "Record
 *                                           // Results" in My Content Plan
 *                                           // (js/plan-data.js opportunity
 *                                           // id) — null/absent for records
 *                                           // added by hand on this page.
 *   }
 *
 * ---------------------------------------------------------------------------
 * LINKING BACK TO MY CONTENT PLAN (Prompt 15)
 * ---------------------------------------------------------------------------
 * upsertForOpportunity() is the write path used by "Record Results" on a
 * Published/Tested card in My Content Plan (js/content-plan.js /
 * js/content-results.js). It keys off `sourceOpportunityId` rather than
 * creating a plain new record every time: the first save creates one record
 * for that opportunity, and every later save (editing the same result)
 * updates that same record in place — so Content History never accumulates
 * duplicates for one planned opportunity, no matter how many times its
 * results are recorded/edited. Records added by hand on the Content History
 * page still work exactly as before (sourceOpportunityId stays null, and
 * addRecord() always creates a new row, same as today).
 * ---------------------------------------------------------------------------
 * FOUNDATION FOR CREATOR RADAR (not wired up yet)
 * ---------------------------------------------------------------------------
 * getHistorySnapshot() below reduces a creator's full history into the small
 * set of aggregates a future Radar/opportunity-scoring pass would want:
 * which topics/formats/platforms show up, and roughly how often the creator
 * publishes. getPerformanceLabel() computes a *relative* Strong/Average/Low
 * read for a single record against that same creator's own average — never
 * a cross-creator or guaranteed-outcome claim. Nothing currently reads
 * these outside this file; they only exist so a future Radar hookup is a
 * small, well-defined change rather than a redesign.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'draftzenn_content_history_v1';
  var CHANGE_EVENT = 'draftzenn:history-changed';

  var PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'Other'];
  var FORMATS = ['Short / Reel', 'Long-form video', 'Post / Carousel', 'Livestream', 'Other'];
  var NUMERIC_FIELDS = ['views', 'likes', 'comments', 'shares'];

  function readStore() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * BUGFIX (Prompt 15 follow-up): this used to swallow a failed
   * localStorage.setItem (private browsing storage restrictions, quota
   * exceeded, a sandboxed/blocked storage context, etc.) instead of
   * surfacing it. Every caller below (addRecord/upsertForOpportunity/
   * removeRecord) calls writeStore() synchronously inside a `.then()`, so
   * silently eating the exception here meant the outer promise still
   * resolved "successfully" — "Record Results" would show its "Results
   * recorded" confirmation even though nothing was actually persisted,
   * which is exactly why the record then never showed up on the Content
   * History page (there was nothing there to read). Rethrowing here lets
   * that rejection propagate through the existing `.catch()` in
   * js/content-results.js (and js/content-history.js's own form), which
   * already knows how to show a real error banner — no new error-handling
   * needed anywhere else.
   */
  function writeStore(store) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      throw new Error(
        'Couldn\u2019t save to Content History \u2014 your browser blocked local storage ' +
        '(private browsing, storage permissions, or storage full). Please try again.'
      );
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

  function makeId() {
    return 'ch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * LocalHistoryProvider
   * -----------------------------------------------------------------------
   * Scopes every read/write by the signed-in user's id, same as
   * LocalPerformanceProvider does — just an array of records per user
   * instead of a single record.
   */
  function LocalHistoryProvider() {}

  LocalHistoryProvider.prototype._currentUserId = function () {
    if (!global.DraftzennAuth) {
      return Promise.reject(new Error('You need to be signed in to do that.'));
    }
    return global.DraftzennAuth.getCurrentUser().then(function (user) {
      if (!user) throw new Error('You need to be signed in to do that.');
      return user.id;
    });
  };

  /**
   * Resolves the current user's saved content records, newest published
   * content first (falls back to when the record was created if two items
   * share a publish date, or if publish date was left blank).
   */
  LocalHistoryProvider.prototype.getHistory = function () {
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      var records = store[userId] || [];
      return records.slice().sort(sortNewestFirst);
    });
  };

  /**
   * Adds a new content record for the current user. Numeric fields are
   * coerced to numbers (or null if left blank); text fields are trimmed.
   * Resolves the full, newest-first list (so callers can just re-render).
   */
  LocalHistoryProvider.prototype.addRecord = function (data) {
    data = data || {};
    return this._currentUserId().then(function (userId) {
      var record = {
        id: makeId(),
        userId: userId,
        topic: (data.topic || '').trim(),
        platform: (data.platform || '').trim(),
        format: (data.format || '').trim(),
        publishDate: (data.publishDate || '').trim(),
        createdAt: new Date().toISOString()
      };

      NUMERIC_FIELDS.forEach(function (field) {
        record[field] = toNumberOrNull(data[field]);
      });

      var store = readStore();
      var records = store[userId] || [];
      records.push(record);
      store[userId] = records;
      writeStore(store);
      emitChange();

      return records.slice().sort(sortNewestFirst);
    });
  };

  /**
   * Creates or updates the single Content History record tied to a given
   * planned opportunity id. First call for an opportunity id creates a new
   * record (with `sourceOpportunityId` set); every later call finds that
   * same record (by `sourceOpportunityId`) and updates it in place instead
   * of adding another one — this is what keeps "Record Results" from ever
   * creating duplicate history rows when a creator edits a result they
   * already logged. Resolves the saved record.
   */
  LocalHistoryProvider.prototype.upsertForOpportunity = function (opportunityId, data) {
    data = data || {};
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      var records = store[userId] || [];
      var existing = opportunityId
        ? records.filter(function (r) { return r.sourceOpportunityId === opportunityId; })[0]
        : null;

      var record = existing || {
        id: makeId(),
        userId: userId,
        sourceOpportunityId: opportunityId || null,
        createdAt: new Date().toISOString()
      };

      record.topic = (data.topic || '').trim();
      record.platform = (data.platform || '').trim();
      record.format = (data.format || '').trim();
      record.publishDate = (data.publishDate || '').trim();
      NUMERIC_FIELDS.forEach(function (field) {
        record[field] = toNumberOrNull(data[field]);
      });
      record.updatedAt = new Date().toISOString();

      if (existing) {
        records = records.map(function (r) { return r.id === existing.id ? record : r; });
      } else {
        records.push(record);
      }

      store[userId] = records;
      writeStore(store);
      emitChange();

      return record;
    });
  };

  /**
   * Looks up the Content History record (if any) already saved for a given
   * planned opportunity id — used to prefill "Record Results" when editing
   * a result that was already entered once. Resolves null if none exists
   * yet, or if opportunityId is falsy.
   */
  LocalHistoryProvider.prototype.getRecordForOpportunity = function (opportunityId) {
    if (!opportunityId) return Promise.resolve(null);
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      var records = store[userId] || [];
      var found = records.filter(function (r) { return r.sourceOpportunityId === opportunityId; })[0];
      return found || null;
    });
  };

  /**
   * Imports normalized YouTube (or, in future, other-platform) records —
   * see js/normalized-creator-data.js for the shape. ADDITIVE ONLY:
   * never touches, edits, or removes any manually-entered record.
   *
   * Dedupe is by (sourcePlatform, sourceContentId): re-syncing the same
   * video updates that one already-imported row's stats in place (so
   * repeated syncs don't create duplicates), while a brand-new video
   * becomes a brand-new record. A record's presence here always implies
   * `imported: true` and a non-null `sourceContentId`, which is exactly
   * how Content History (js/content-history.js) tells imported rows
   * apart from hand-entered ones when rendering.
   *
   * Resolves { records: <full newest-first list>, addedCount, updatedCount }.
   */
  LocalHistoryProvider.prototype.importRecords = function (normalizedRecords) {
    normalizedRecords = Array.isArray(normalizedRecords) ? normalizedRecords : [];
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      var records = store[userId] || [];
      var addedCount = 0;
      var updatedCount = 0;

      normalizedRecords.forEach(function (n) {
        if (!n || !n.contentId) return; // can't dedupe/import without a stable id

        var existing = records.filter(function (r) {
          return r.imported && r.sourcePlatform === n.platform && r.sourceContentId === n.contentId;
        })[0];

        var mapped = {
          topic: n.title || '',
          platform: platformLabel(n.platform),
          format: formatLabel(n.format),
          publishDate: (n.publishDate || '').slice(0, 10),
          views: n.views,
          likes: n.likes,
          comments: n.comments,
          shares: n.shares,
          imported: true,
          sourcePlatform: n.platform,
          sourceContentId: n.contentId,
          sourceUrl: n.url
        };

        if (existing) {
          Object.assign(existing, mapped);
          existing.updatedAt = new Date().toISOString();
          updatedCount++;
        } else {
          records.push(Object.assign({
            id: makeId(),
            userId: userId,
            sourceOpportunityId: null,
            createdAt: new Date().toISOString()
          }, mapped));
          addedCount++;
        }
      });

      store[userId] = records;
      writeStore(store);
      if (addedCount || updatedCount) emitChange();

      return {
        records: records.slice().sort(sortNewestFirst),
        addedCount: addedCount,
        updatedCount: updatedCount
      };
    });
  };

  /** Maps a normalized platform id ('youtube') to this store's display label ('YouTube'). */
  function platformLabel(platformId) {
    if (platformId === 'youtube') return 'YouTube';
    if (platformId === 'instagram') return 'Instagram';
    if (platformId === 'tiktok') return 'TikTok';
    return 'Other';
  }

  /** Maps a normalized format ('short' | 'video') to this store's FORMATS options. */
  function formatLabel(format) {
    if (format === 'short') return 'Short / Reel';
    if (format === 'video') return 'Long-form video';
    return 'Other';
  }

  /**
   * Removes one record (by id) for the current user. Resolves the
   * remaining newest-first list.
   */
  LocalHistoryProvider.prototype.removeRecord = function (id) {
    return this._currentUserId().then(function (userId) {
      var store = readStore();
      var records = store[userId] || [];
      store[userId] = records.filter(function (r) { return r.id !== id; });
      writeStore(store);
      emitChange();
      return store[userId].slice().sort(sortNewestFirst);
    });
  };

  function sortNewestFirst(a, b) {
    var aTime = dateValue(a.publishDate) || dateValue(a.createdAt) || 0;
    var bTime = dateValue(b.publishDate) || dateValue(b.createdAt) || 0;
    return bTime - aTime;
  }

  function dateValue(str) {
    if (!str) return 0;
    var t = new Date(str).getTime();
    return isNaN(t) ? 0 : t;
  }

  function onChange(callback) {
    if (typeof callback !== 'function') return;
    document.addEventListener(CHANGE_EVENT, callback);
  }

  /**
   * A record's engagement total (likes + comments + shares), or null if
   * none of those were entered.
   */
  function engagementTotal(record) {
    var parts = [record.likes, record.comments, record.shares]
      .filter(function (n) { return typeof n === 'number'; });
    if (!parts.length) return null;
    return parts.reduce(function (sum, n) { return sum + n; }, 0);
  }

  /**
   * Relative, basic result indicator for one record — compares its views
   * against the creator's own average views across everything they've
   * logged. This is intentionally simple and self-referential: it says
   * "better/worse than your own average", never "will perform well" or
   * anything implying a guaranteed outcome.
   *
   * Returns 'Strong' | 'Average' | 'Low' | null (null when there isn't
   * enough data — fewer than 2 records with views entered, or this record
   * has no views entered).
   */
  function getPerformanceLabel(record, allRecords) {
    if (!record || typeof record.views !== 'number') return null;

    var withViews = (allRecords || []).filter(function (r) { return typeof r.views === 'number'; });
    if (withViews.length < 2) return null;

    var avg = withViews.reduce(function (sum, r) { return sum + r.views; }, 0) / withViews.length;
    if (avg <= 0) return null;

    var ratio = record.views / avg;
    if (ratio >= 1.2) return 'Strong';
    if (ratio <= 0.8) return 'Low';
    return 'Average';
  }

  /**
   * Reduces a creator's full history into the small, stable aggregates a
   * future Radar pass would consume: which topics/formats/platforms
   * they've covered, and roughly how often they publish. Purely
   * descriptive — no comparisons to other creators, no predictions.
   * Resolves null if the creator has no history yet.
   */
  function toSnapshot(records) {
    if (!records || !records.length) return null;

    var topics = [];
    var formats = {};
    var platforms = {};

    records.forEach(function (r) {
      if (r.topic) topics.push(r.topic);
      if (r.format) formats[r.format] = (formats[r.format] || 0) + 1;
      if (r.platform) platforms[r.platform] = (platforms[r.platform] || 0) + 1;
    });

    var dated = records
      .map(function (r) { return dateValue(r.publishDate); })
      .filter(function (t) { return t > 0; })
      .sort(function (a, b) { return a - b; });

    var spanDays = dated.length > 1 ? (dated[dated.length - 1] - dated[0]) / 86400000 : null;
    var postsPerWeek = (spanDays && spanDays > 0) ? (dated.length / spanDays) * 7 : null;

    return {
      totalRecords: records.length,
      topics: topics,
      formatCounts: formats,
      platformCounts: platforms,
      postsPerWeek: postsPerWeek
    };
  }

  var provider = new LocalHistoryProvider();

  /**
   * Public facade — this is what every page calls.
   */
  var DraftzennHistory = {
    getHistory: function () {
      return provider.getHistory();
    },

    addRecord: function (data) {
      return provider.addRecord(data);
    },

    upsertForOpportunity: function (opportunityId, data) {
      return provider.upsertForOpportunity(opportunityId, data);
    },

    getRecordForOpportunity: function (opportunityId) {
      return provider.getRecordForOpportunity(opportunityId);
    },

    removeRecord: function (id) {
      return provider.removeRecord(id);
    },

    /**
     * Imports normalized records (e.g. from js/youtube-integration.js's
     * sync()) as additive, clearly-tagged rows — see importRecords above
     * for dedupe behavior. Never modifies manually-entered records.
     */
    importRecords: function (normalizedRecords) {
      return provider.importRecords(normalizedRecords);
    },

    getPerformanceLabel: getPerformanceLabel,
    engagementTotal: engagementTotal,

    /**
     * Convenience helper: fetches the current user's full history and
     * returns it already reduced via toSnapshot() (see comment above).
     */
    getHistorySnapshot: function () {
      return provider.getHistory().then(toSnapshot);
    },

    PLATFORMS: PLATFORMS,
    FORMATS: FORMATS,

    onChange: onChange,
    CHANGE_EVENT: CHANGE_EVENT
  };

  global.DraftzennHistory = DraftzennHistory;
})(window);
