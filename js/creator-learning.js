/**
 * Draftzenn — Creator Learning Loop (foundation)
 * ---------------------------------------------------------------------------
 * DEMO / LOCAL-DATA LEARNING LAYER.
 *
 * Turns the creator's own Published/Tested Content History
 * (js/content-history-data.js) into a small set of transparent, creator-
 * specific "learning signals" — which topic/format/platform has actually
 * worked best for THIS creator, which combinations have underperformed,
 * and whether recent content is trending up or down against their own
 * earlier average. Nothing here compares across creators, and nothing
 * here is a prediction — every number is a plain average over records the
 * creator entered themselves.
 *
 * This is the foundation of Discover -> Decide -> Create -> Publish ->
 * Measure -> Learn -> Improve: it only covers Measure -> Learn. "Improve"
 * (feeding these signals back into Radar personalization) is a small,
 * additive hook in js/radar-scoring.js — this file has no opinion on
 * scoring at all, it only produces the signals.
 *
 * WHAT COUNTS AS "MEASURED" CONTENT
 * -----------------------------------------------------------------------
 * Only Content History records with an actual `views` number entered are
 * used — i.e. content the creator has logged real results for. A record
 * added for something merely Planned or In Progress (no metrics yet)
 * contributes nothing until real numbers are entered. This file never
 * reads js/plan-data.js directly; it relies entirely on whether a metric
 * was actually recorded, which is a simpler and equally correct way to
 * keep unmeasured content out of the learning signals.
 *
 * CONFIDENCE
 * -----------------------------------------------------------------------
 * `dataConfidence` is 'none' | 'low' | 'medium' | 'high', purely a function
 * of how many measured records exist. Below the 'medium' threshold,
 * `hasEnoughData` is false and every derived signal (strongestTopic/
 * strongestFormat/strongestPlatform/weakPatterns) is left null/empty on
 * purpose — this file will not present a single data point as a "pattern".
 * `recentPerformanceTrend` needs its own, larger minimum (see
 * computeTrend) since it requires splitting history into two halves.
 *
 * Public API:
 *   DraftzennLearning.computeLearningSignals(historyRecords) -> signals
 *     (pure, synchronous — see the returned shape below)
 *
 *   DraftzennLearning.getLearningSignals() -> Promise<signals>
 *     Fetches the current user's Content History, computes signals, and
 *     caches them (see PERSISTENCE below). Convenience wrapper; anywhere
 *     that already has the records (e.g. js/creator-radar.js, which fetches
 *     Content History for its own scoring context anyway) should just call
 *     computeLearningSignals(records) directly instead.
 *
 *   DraftzennLearning.getSummaryBullets(signals) -> { bullets, emptyMessage }
 *     Turns a signals object into the small "Creator Learning" panel's
 *     copy — 0-4 short strings, or a single honest empty-state message
 *     when there isn't enough measured history yet. Every bullet traces
 *     back to a field on `signals`; nothing is invented here either.
 *
 * signals shape:
 *   {
 *     strongestTopic: string | null,
 *     strongestFormat: string | null,      // Content History format vocab
 *     strongestPlatform: string | null,
 *     weakPatterns: [{ topic, format, avgViews }],
 *     recentPerformanceTrend: 'improving' | 'declining' | 'steady' | null,
 *     dataConfidence: 'none' | 'low' | 'medium' | 'high',
 *     hasEnoughData: boolean,   // true once dataConfidence is 'medium'+
 *     totalEligible: number,    // measured (views-entered) record count
 *     overallAvgViews: number | undefined
 *   }
 *
 * PERSISTENCE
 * -----------------------------------------------------------------------
 * Signals are a pure function of Content History, which already persists
 * to localStorage (js/content-history-data.js) — so they're always
 * re-derivable and never a second source of truth. cacheLearningSignals()
 * additionally stores the last computed snapshot under its own
 * localStorage key, scoped by user id, exactly like every other local
 * store in this app (js/performance-data.js, js/plan-data.js). No new
 * Supabase table. This cache is read-your-own-write convenience only —
 * every real read recomputes from Content History rather than trusting
 * the cache as authoritative.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'draftzenn_creator_learning_v1';

  // Below MEDIUM, we don't claim any pattern exists at all (dataConfidence
  // 'low'). MEDIUM+ is the minimum for a "strongest X" or "weak pattern"
  // claim; HIGH is just a friendlier label for a well-supported one — it
  // doesn't unlock anything extra here, only used to word the panel later
  // if ever needed.
  var MIN_FOR_MEDIUM = 3;
  var MIN_FOR_HIGH = 6;

  // A group's average has to clear this ratio over the creator's own
  // overall average to be called "strongest"; a group has to fall below
  // the inverse ratio to be called "weak". Anything in between is treated
  // as noise, not a pattern.
  var STRONG_RATIO = 1.15;
  var WEAK_RATIO = 0.85;

  // Trend comparison (recent half vs. earlier half) needs enough records
  // on each side to mean anything — smaller than this and we just don't
  // report a trend rather than guessing from 1-2 posts per half.
  var MIN_FOR_TREND = 4;

  function hasMetrics(record) {
    return !!record && typeof record.views === 'number';
  }

  function confidenceLevel(n) {
    if (n <= 0) return 'none';
    if (n < MIN_FOR_MEDIUM) return 'low';
    if (n < MIN_FOR_HIGH) return 'medium';
    return 'high';
  }

  function average(nums) {
    if (!nums || !nums.length) return null;
    var sum = nums.reduce(function (s, n) { return s + n; }, 0);
    return sum / nums.length;
  }

  function groupBy(records, key) {
    var groups = {};
    records.forEach(function (r) {
      var k = (r[key] || '').trim();
      if (!k) return;
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });
    return groups;
  }

  /**
   * Picks the single strongest key in a group-by result — e.g. the topic
   * with the highest average views — but only if there's actually more
   * than one group to compare AND that group clearly leads (STRONG_RATIO)
   * the creator's own overall average. Returns null rather than a weak or
   * meaningless "winner" otherwise.
   */
  function pickStrongest(groups, overallAvg) {
    var keys = Object.keys(groups);
    if (keys.length < 2 || !overallAvg) return null;

    var bestKey = null;
    var bestAvg = -1;
    keys.forEach(function (k) {
      var avg = average(groups[k].map(function (r) { return r.views; }));
      if (avg !== null && avg > bestAvg) {
        bestAvg = avg;
        bestKey = k;
      }
    });

    if (!bestKey || bestAvg <= 0 || (bestAvg / overallAvg) < STRONG_RATIO) return null;
    return bestKey;
  }

  /**
   * Topic+format combinations that clearly underperform the creator's own
   * overall average (WEAK_RATIO). Only evaluated once there's more than
   * one combination logged — a single combination has nothing to be
   * "weak" relative to.
   */
  function pickWeakPatterns(eligible, overallAvg) {
    if (!overallAvg) return [];

    var combos = {};
    eligible.forEach(function (r) {
      if (!r.topic && !r.format) return;
      var key = (r.topic || '\u2014') + '||' + (r.format || '\u2014');
      if (!combos[key]) combos[key] = { topic: r.topic || '', format: r.format || '', records: [] };
      combos[key].records.push(r);
    });

    var keys = Object.keys(combos);
    if (keys.length < 2) return [];

    var weak = [];
    keys.forEach(function (key) {
      var combo = combos[key];
      var avg = average(combo.records.map(function (r) { return r.views; }));
      if (avg !== null && (avg / overallAvg) <= WEAK_RATIO) {
        weak.push({ topic: combo.topic, format: combo.format, avgViews: Math.round(avg) });
      }
    });
    return weak;
  }

  function dateValue(record) {
    var str = record.publishDate || record.createdAt;
    if (!str) return 0;
    var t = new Date(str).getTime();
    return isNaN(t) ? 0 : t;
  }

  /**
   * Splits measured records into an earlier half and a more recent half
   * (by publish date, falling back to when the record was logged) and
   * compares average views between the two. Only returns a verdict when
   * there's enough on each side (MIN_FOR_TREND) — otherwise null, since
   * "recent" vs. "earlier" is meaningless with only 1-2 posts on a side.
   */
  function computeTrend(eligible) {
    if (eligible.length < MIN_FOR_TREND) return null;

    var sorted = eligible.slice().sort(function (a, b) { return dateValue(a) - dateValue(b); });
    var mid = Math.floor(sorted.length / 2);
    var earlier = sorted.slice(0, mid);
    var recent = sorted.slice(mid);

    var earlierAvg = average(earlier.map(function (r) { return r.views; }));
    var recentAvg = average(recent.map(function (r) { return r.views; }));
    if (!earlierAvg || !recentAvg) return null;

    var ratio = recentAvg / earlierAvg;
    if (ratio >= STRONG_RATIO) return 'improving';
    if (ratio <= WEAK_RATIO) return 'declining';
    return 'steady';
  }

  /**
   * Pure, synchronous core: reduces the creator's full Content History
   * into the learning signals described in the file header. Safe to call
   * with an empty/undefined array — returns the 'none'-confidence shape.
   */
  function computeLearningSignals(records) {
    records = records || [];
    var eligible = records.filter(hasMetrics);
    var totalEligible = eligible.length;
    var dataConfidence = confidenceLevel(totalEligible);

    if (!totalEligible) {
      return {
        strongestTopic: null,
        strongestFormat: null,
        strongestPlatform: null,
        weakPatterns: [],
        recentPerformanceTrend: null,
        dataConfidence: 'none',
        hasEnoughData: false,
        totalEligible: 0
      };
    }

    var overallAvg = average(eligible.map(function (r) { return r.views; }));
    var hasEnoughData = totalEligible >= MIN_FOR_MEDIUM;

    return {
      strongestTopic: hasEnoughData ? pickStrongest(groupBy(eligible, 'topic'), overallAvg) : null,
      strongestFormat: hasEnoughData ? pickStrongest(groupBy(eligible, 'format'), overallAvg) : null,
      strongestPlatform: hasEnoughData ? pickStrongest(groupBy(eligible, 'platform'), overallAvg) : null,
      weakPatterns: hasEnoughData ? pickWeakPatterns(eligible, overallAvg) : [],
      recentPerformanceTrend: computeTrend(eligible),
      dataConfidence: dataConfidence,
      hasEnoughData: hasEnoughData,
      totalEligible: totalEligible,
      overallAvgViews: (overallAvg !== null ? Math.round(overallAvg) : undefined)
    };
  }

  /**
   * Turns a signals object into the "Creator Learning" panel's copy.
   * Returns `{ bullets: [], emptyMessage: '...' }` whenever there isn't
   * enough measured history to say anything specific — CASE A/low-data
   * per Prompt 14 — and `{ bullets: [...up to 4], emptyMessage: null }`
   * once there is. Never fabricates a bullet beyond what `signals` states.
   */
  function getSummaryBullets(signals) {
    if (!signals || signals.dataConfidence === 'none') {
      return {
        bullets: [],
        emptyMessage: 'Keep publishing and testing content. Draftzenn will learn your strongest patterns as more results are recorded.'
      };
    }

    if (!signals.hasEnoughData) {
      var n = signals.totalEligible;
      return {
        bullets: [],
        emptyMessage: 'You have ' + n + ' tested post' + (n === 1 ? '' : 's') + ' logged so far \u2014 ' +
          'keep publishing and testing content and Draftzenn will learn your strongest patterns.'
      };
    }

    var bullets = [];

    if (signals.strongestTopic) {
      bullets.push('Your ' + signals.strongestTopic + ' content has been your strongest content pattern.');
    }
    if (signals.strongestFormat) {
      bullets.push(signals.strongestFormat + ' currently outperforms your other recorded formats.');
    }
    if (signals.recentPerformanceTrend === 'improving') {
      bullets.push('Your recent content is performing better than your earlier posts.');
    } else if (signals.recentPerformanceTrend === 'declining') {
      bullets.push('Your recent content is performing below your earlier posts \u2014 worth a look.');
    }
    if (signals.strongestPlatform) {
      bullets.push('You\u2019ve had your strongest results on ' + signals.strongestPlatform + '.');
    }

    if (!bullets.length && signals.weakPatterns.length) {
      bullets.push('No single strongest pattern yet, but some combinations are underperforming your own average \u2014 worth testing something different.');
    }

    if (!bullets.length) {
      return {
        bullets: [],
        emptyMessage: 'Keep publishing and testing content. Draftzenn will learn your strongest patterns as more results are recorded.'
      };
    }

    return { bullets: bullets.slice(0, 4), emptyMessage: null };
  }

  function readCache() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeCache(store) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // localStorage unavailable — signals just won't be cached this
      // session; they're always re-derivable from Content History anyway.
    }
  }

  /**
   * Caches the last computed signals for the current user. Fire-and-forget
   * convenience only (see PERSISTENCE above) — never awaited, and safe to
   * call even when signed-out (no-ops).
   */
  function cacheLearningSignals(signals) {
    if (!global.DraftzennAuth) return;
    global.DraftzennAuth.getCurrentUser().then(function (user) {
      if (!user) return;
      var store = readCache();
      store[user.id] = { signals: signals, updatedAt: new Date().toISOString() };
      writeCache(store);
    }).catch(function () { /* not signed in / auth not ready — ignore */ });
  }

  /**
   * Fetches the current user's Content History, computes signals, caches
   * them, and resolves the result. Most callers that already have Content
   * History records loaded (e.g. js/creator-radar.js) should call
   * computeLearningSignals(records) directly instead of round-tripping
   * through here again.
   */
  function getLearningSignals() {
    if (!global.DraftzennHistory) return Promise.resolve(computeLearningSignals([]));
    return global.DraftzennHistory.getHistory()
      .then(function (records) {
        var signals = computeLearningSignals(records);
        cacheLearningSignals(signals);
        return signals;
      })
      .catch(function () { return computeLearningSignals([]); });
  }

  global.DraftzennLearning = {
    computeLearningSignals: computeLearningSignals,
    getLearningSignals: getLearningSignals,
    getSummaryBullets: getSummaryBullets,
    cacheLearningSignals: cacheLearningSignals
  };
})(window);
