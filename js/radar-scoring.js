/**
 * Draftzenn — Creator Radar personalized scoring engine
 * ---------------------------------------------------------------------------
 * DEMO / LOCAL-DATA SCORING LAYER.
 *
 * Turns each static Radar opportunity (js/radar-data.js) into a
 * *personalized* score for the signed-in creator, using only data that
 * already exists locally:
 *
 *   - Creator Profile      (js/profile-provider.js)   -> niche/platform/contentType
 *   - Creator Performance   (js/performance-data.js)   -> bestTopic/bestFormat/avgViews
 *   - Content History       (js/content-history-data.js) -> topics/formats/platforms
 *     the creator has actually posted, plus per-record performance labels
 *   - The opportunity itself                           -> trendStrength/
 *     competition/audienceFit (baseline descriptors set by the demo data)
 *
 * This file is intentionally pure logic — no DOM, no localStorage, no auth.
 * js/creator-radar.js owns fetching the context (profile/performance/
 * history) and rendering; this file only turns that context + an
 * opportunity into a score. That split is what lets a future real
 * trend-data backend swap in without touching the scoring math: it only
 * needs to hand this module differently-sourced Opportunity objects and
 * the same `context` shape.
 *
 * Public API:
 *   DraftzennRadarScoring.scoreOpportunity(opportunity, context)
 *     -> { overall, breakdown, isEstimated, hasPersonalData, reasons,
 *          explanation, recommendationReasons }
 *
 *   DraftzennRadarScoring.scoreOpportunities(opportunities, context)
 *     -> array of shallow clones of `opportunities`, each with:
 *          .opportunityScore   (overwritten with the personalized overall score,
 *                               0-100 — this is what drives existing sorting,
 *                               filtering, and the score badge everywhere else)
 *          .demoOpportunityScore (the original static demo score, preserved)
 *          .scoreBreakdown     { opportunity, audienceFit, personalFit, competition }
 *          .scoreIsEstimated   boolean — true when there's no Performance or
 *                              Content History data yet, so personalFit could
 *                              not be computed from anything the creator
 *                              actually entered (see NO-DATA FALLBACK below)
 *          .scoreExplanation   short string built from the scoring inputs
 *          .recommendationReasons  array of 2-4 short "Why this recommended
 *                              to you?" bullet strings (see
 *                              buildRecommendationReasons below) — distinct
 *                              from .scoreExplanation ("Why this score?")
 *
 * `context` shape (all optional — every piece degrades gracefully):
 *   {
 *     profile: { creatorName, platform, niche, contentType } | null,
 *     performanceSnapshot: DraftzennPerformance.getPerformanceSnapshot() result | null,
 *     historySnapshot: DraftzennHistory.getHistorySnapshot() result | null,
 *     historyRecords: DraftzennHistory.getHistory() result (array) | [],
 *     learningSignals: DraftzennLearning.computeLearningSignals() result | null
 *   }
 *
 * CREATOR LEARNING INFLUENCE (js/creator-learning.js)
 * -----------------------------------------------------------------------
 * `context.learningSignals` is optional and, when present, only nudges
 * Personal Fit — it never replaces the existing Performance/Content
 * History logic above. The nudge only applies once
 * `learningSignals.hasEnoughData` is true (js/creator-learning.js already
 * refuses to name a "strongest" anything below its own confidence floor),
 * so an opportunity gets zero learning influence until the creator has
 * logged enough measured (Published/Tested) results — see
 * computePersonalFit() and buildRecommendationReasons() below.
 * ---------------------------------------------------------------------------
 *
 * NO-DATA FALLBACK
 * -----------------------------------------------------------------------
 * Personal Fit is the one component built entirely from the creator's own
 * saved data. If they haven't entered Performance or Content History yet,
 * we never invent a Personal Fit number — `breakdown.personalFit` is `null`
 * and `isEstimated` is `true`, with the "Personal Fit" weight folded back
 * into Opportunity/Audience Fit/Competition so the overall score is still a
 * useful (clearly-marked) estimate rather than a broken one.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // Opportunity's own trend strength, converted to a 0-100 "how strong is
  // this trend, independent of any one creator" component.
  var TREND_SCORE = { Early: 45, Building: 62, Strong: 80, 'Very strong': 95 };
  var DEFAULT_TREND_SCORE = 60;

  // Lower competition is better, hence "score" here means "room to win".
  var COMPETITION_SCORE = { Low: 90, Medium: 65, High: 40 };
  var DEFAULT_COMPETITION_SCORE = 60;

  // Baseline for the opportunity's own stated audience appetite, before any
  // profile-specific adjustment.
  var AUDIENCE_BASE = { Early: 45, Moderate: 68, Strong: 88 };
  var DEFAULT_AUDIENCE_BASE = 60;

  // Content History uses its own format vocabulary (see FORMATS in
  // js/content-history-data.js); Creator Radar / Creator Performance use the
  // Creator Profile's contentType vocabulary. This maps one to the other so
  // "what format actually works for this creator" can be compared against
  // an opportunity's `contentType` at all.
  var HISTORY_FORMAT_TO_CONTENT_TYPE = {
    'Short / Reel': 'Shorts/Reels',
    'Long-form video': 'Long-form',
    'Post / Carousel': 'Other',
    'Livestream': 'Other',
    'Other': 'Other'
  };

  var STOPWORDS = {
    the: 1, a: 1, an: 1, for: 1, and: 1, or: 1, of: 1, to: 1, in: 1, on: 1,
    your: 1, you: 1, with: 1, is: 1, this: 1, that: 1, it: 1, vs: 1, are: 1
  };

  var REASON_TEXT = {
    niche_match: 'this topic fits your niche',
    niche_mismatch: "it's outside your usual niche",
    platform_match: 'it matches your platform',
    platform_mismatch: "it's on a different platform than you usually post to",
    content_type_match: 'it fits the format you create',
    format_match_performance: 'it matches your best-performing format',
    format_match_history: 'it matches the format you post most often',
    topic_match: 'it\u2019s close to a topic you\u2019ve already had success with',
    platform_experience: 'you\u2019ve already published on this platform before',
    strong_track_record: 'similar content of yours has performed above your own average',
    weak_track_record: 'similar content of yours has performed below your own average',
    low_competition: 'competition is low right now',
    high_competition: 'competition is high right now',
    strong_trend: 'the underlying trend is strong',
    learned_strong_topic: 'this topic has performed well in your own recorded results',
    learned_strong_format: 'this format has performed well in your own recorded results',
    learned_strong_platform: 'you\u2019ve had strong recorded results on this platform',
    learned_weak_pattern: 'this matches a topic/format combination that has underperformed for you so far'
  };

  function clamp(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function normalizeFormat(format) {
    return HISTORY_FORMAT_TO_CONTENT_TYPE[format] || format || '';
  }

  function contentTypeCompatible(a, b) {
    if (!a || !b) return false;
    return a === b || a === 'Both' || b === 'Both';
  }

  function mostFrequentKey(counts) {
    if (!counts) return null;
    var bestKey = null;
    var bestCount = -1;
    Object.keys(counts).forEach(function (key) {
      if (counts[key] > bestCount) {
        bestCount = counts[key];
        bestKey = key;
      }
    });
    return bestKey;
  }

  function keywordSet(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(function (w) { return w.length > 3 && !STOPWORDS[w]; });
  }

  function topicsOverlap(opportunityTopic, candidateTopics) {
    if (!opportunityTopic || !candidateTopics || !candidateTopics.length) return false;
    var oppWords = keywordSet(opportunityTopic);
    if (!oppWords.length) return false;
    return candidateTopics.some(function (candidate) {
      var candidateWords = keywordSet(candidate);
      for (var i = 0; i < candidateWords.length; i++) {
        if (oppWords.indexOf(candidateWords[i]) !== -1) return true;
      }
      return false;
    });
  }

  /**
   * The "Opportunity" breakdown component: how strong the underlying trend
   * is, on its own — the one component that isn't about this creator at all.
   */
  function computeTrendComponent(opportunity) {
    var value = TREND_SCORE[opportunity.trendStrength];
    return typeof value === 'number' ? value : DEFAULT_TREND_SCORE;
  }

  /**
   * The "Competition" breakdown component: room to win, inverse of how
   * crowded the opportunity already is.
   */
  function computeCompetitionComponent(opportunity) {
    var value = COMPETITION_SCORE[opportunity.competition];
    return typeof value === 'number' ? value : DEFAULT_COMPETITION_SCORE;
  }

  /**
   * The "Audience Fit" breakdown component: how well this opportunity's
   * audience appetite lines up with the creator's own saved niche/platform/
   * content type. Falls back to just the opportunity's own baseline
   * descriptor when there's no profile at all (shouldn't normally happen on
   * the dashboard, since onboarding is required first, but keeps this
   * function safe to call standalone).
   */
  function computeAudienceFit(opportunity, profile) {
    var score = AUDIENCE_BASE[opportunity.audienceFit];
    score = typeof score === 'number' ? score : DEFAULT_AUDIENCE_BASE;
    var reasons = [];

    if (profile) {
      if (profile.niche) {
        if (opportunity.niche === profile.niche) {
          score += 12;
          reasons.push({ code: 'niche_match', dir: 'pos' });
        } else {
          score -= 10;
          reasons.push({ code: 'niche_mismatch', dir: 'neg' });
        }
      }
      if (profile.platform) {
        if (opportunity.platform === profile.platform) {
          score += 6;
          reasons.push({ code: 'platform_match', dir: 'pos' });
        } else {
          score -= 6;
          reasons.push({ code: 'platform_mismatch', dir: 'neg' });
        }
      }
      if (profile.contentType && opportunity.contentType &&
          contentTypeCompatible(opportunity.contentType, profile.contentType)) {
        score += 4;
        reasons.push({ code: 'content_type_match', dir: 'pos' });
      }
    }

    return { score: clamp(score), reasons: reasons };
  }

  /**
   * The "Personal Fit" breakdown component: how well this opportunity
   * matches patterns from the creator's OWN saved Performance and Content
   * History data. Returns `{ score: null, hasData: false }` — never a
   * fabricated number — when neither source has anything saved yet.
   */
  function computePersonalFit(opportunity, context) {
    var performance = context.performanceSnapshot || null;
    var history = context.historySnapshot || null;
    var records = context.historyRecords || [];

    var hasData = !!(performance || history || (records && records.length));
    if (!hasData) {
      return { score: null, hasData: false, reasons: [] };
    }

    var score = 50;
    var reasons = [];

    // Best-performing format (from Creator Performance) already uses the
    // same vocabulary as opportunity.contentType — direct comparison.
    if (performance && performance.bestFormat &&
        contentTypeCompatible(performance.bestFormat, opportunity.contentType)) {
      score += 15;
      reasons.push({ code: 'format_match_performance', dir: 'pos' });
    }

    // Most-used format from Content History, normalized to the same
    // vocabulary before comparing.
    var topFormat = history ? mostFrequentKey(history.formatCounts) : null;
    if (topFormat) {
      var normalizedTopFormat = normalizeFormat(topFormat);
      if (contentTypeCompatible(normalizedTopFormat, opportunity.contentType)) {
        score += 12;
        reasons.push({ code: 'format_match_history', dir: 'pos' });
      }
    }

    // Topic overlap: best topic (Performance) and/or logged topics
    // (Content History) vs. this opportunity's topic, by keyword overlap.
    var topicSources = [];
    if (performance && performance.bestTopic) topicSources.push(performance.bestTopic);
    if (history && history.topics && history.topics.length) {
      topicSources = topicSources.concat(history.topics);
    }
    if (topicsOverlap(opportunity.topic, topicSources)) {
      score += 15;
      reasons.push({ code: 'topic_match', dir: 'pos' });
    }

    // Platform experience: has the creator actually posted on this platform
    // before, per their logged history?
    if (history && history.platformCounts && history.platformCounts[opportunity.platform]) {
      score += 6;
      reasons.push({ code: 'platform_experience', dir: 'pos' });
    }

    // Real track record: among logged records that match this
    // opportunity's platform/format, how did they actually do relative to
    // the creator's own average? Uses DraftzennHistory.getPerformanceLabel
    // — self-referential only, never a cross-creator or guaranteed claim.
    if (records.length && global.DraftzennHistory && global.DraftzennHistory.getPerformanceLabel) {
      var matching = records.filter(function (record) {
        var normalized = normalizeFormat(record.format);
        var formatOk = !record.format || contentTypeCompatible(normalized, opportunity.contentType);
        var platformOk = !record.platform || record.platform === opportunity.platform;
        return formatOk && platformOk;
      });

      var labels = matching
        .map(function (record) { return global.DraftzennHistory.getPerformanceLabel(record, records); })
        .filter(Boolean);

      if (labels.length) {
        var strongCount = labels.filter(function (l) { return l === 'Strong'; }).length;
        var lowCount = labels.filter(function (l) { return l === 'Low'; }).length;
        if (strongCount > lowCount) {
          score += 10;
          reasons.push({ code: 'strong_track_record', dir: 'pos' });
        } else if (lowCount > strongCount) {
          score -= 10;
          reasons.push({ code: 'weak_track_record', dir: 'neg' });
        }
      }
    }

    // Creator Learning influence (js/creator-learning.js) — a small,
    // additive nudge on top of everything above, never a replacement for
    // it. Only applied once learningSignals.hasEnoughData is true, so an
    // opportunity gets zero learning influence until there's enough
    // measured (Published/Tested) history to support a claim at all.
    var learning = context.learningSignals || null;
    if (learning && learning.hasEnoughData) {
      if (learning.strongestTopic && topicsOverlap(opportunity.topic, [learning.strongestTopic])) {
        score += 8;
        reasons.push({ code: 'learned_strong_topic', dir: 'pos' });
      }

      var normalizedStrongFormat = learning.strongestFormat ? normalizeFormat(learning.strongestFormat) : null;
      if (normalizedStrongFormat && contentTypeCompatible(normalizedStrongFormat, opportunity.contentType)) {
        score += 8;
        reasons.push({ code: 'learned_strong_format', dir: 'pos' });
      }

      if (learning.strongestPlatform && learning.strongestPlatform === opportunity.platform) {
        score += 5;
        reasons.push({ code: 'learned_strong_platform', dir: 'pos' });
      }

      if (learning.weakPatterns && learning.weakPatterns.length) {
        var hitsWeakPattern = learning.weakPatterns.some(function (pattern) {
          var topicHit = pattern.topic && topicsOverlap(opportunity.topic, [pattern.topic]);
          var normalizedWeakFormat = pattern.format ? normalizeFormat(pattern.format) : null;
          var formatHit = normalizedWeakFormat && contentTypeCompatible(normalizedWeakFormat, opportunity.contentType);
          return topicHit && formatHit;
        });
        if (hitsWeakPattern) {
          score -= 8;
          reasons.push({ code: 'learned_weak_pattern', dir: 'neg' });
        }
      }
    }

    return { score: clamp(score), hasData: true, reasons: reasons };
  }

  function competitionReasons(opportunity) {
    if (opportunity.competition === 'High') return [{ code: 'high_competition', dir: 'neg' }];
    if (opportunity.competition === 'Low') return [{ code: 'low_competition', dir: 'pos' }];
    return [];
  }

  function trendReasons(opportunity) {
    if (opportunity.trendStrength === 'Strong' || opportunity.trendStrength === 'Very strong') {
      return [{ code: 'strong_trend', dir: 'pos' }];
    }
    return [];
  }

  function joinList(items) {
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /**
   * Builds the "Why this recommended to you?" bullet list — short,
   * creator-specific reasons this particular opportunity was surfaced for
   * this particular creator. Separate from buildExplanation()/"Why this
   * score?": that one explains the *number*, this one explains the *pick*.
   *
   * Every bullet is derived directly from context (Creator Profile,
   * Creator Performance, Content History) and the opportunity's own
   * attributes — never invented. When there's no Performance or Content
   * History saved yet, only profile- and opportunity-attribute bullets can
   * fire, which is intentional (see NO-DATA FALLBACK note below) rather
   * than a bug: we never claim a track record that doesn't exist.
   *
   * Returns an array of 2-4 short strings, most relevant first.
   */
  function buildRecommendationReasons(opportunity, context) {
    context = context || {};
    var profile = context.profile || null;
    var performance = context.performanceSnapshot || null;
    var history = context.historySnapshot || null;
    var records = context.historyRecords || [];
    var bullets = [];

    // Platform / niche: straight profile-vs-opportunity comparison.
    if (profile && profile.platform && opportunity.platform === profile.platform) {
      bullets.push('Matches your platform (' + opportunity.platform + ').');
    }
    if (profile && profile.niche && opportunity.niche === profile.niche) {
      bullets.push('Matches your ' + opportunity.niche + ' niche.');
    }

    // Format: prefer a real "best-performing format" (Creator Performance)
    // match, then a "most-posted format" (Content History) match, then
    // fall back to the creator's stated profile content type — in that
    // order of how strong a signal each one is.
    if (performance && performance.bestFormat &&
        contentTypeCompatible(performance.bestFormat, opportunity.contentType)) {
      bullets.push('Matches your best-performing format (' + opportunity.contentType + ').');
    } else {
      var topFormat = history ? mostFrequentKey(history.formatCounts) : null;
      var normalizedTopFormat = topFormat ? normalizeFormat(topFormat) : null;
      if (normalizedTopFormat && contentTypeCompatible(normalizedTopFormat, opportunity.contentType)) {
        bullets.push('Matches the format you post most often (' + opportunity.contentType + ').');
      } else if (profile && profile.contentType &&
          contentTypeCompatible(opportunity.contentType, profile.contentType)) {
        bullets.push('Fits the ' + opportunity.contentType + ' format you create.');
      }
    }

    // Topic: best topic (Performance) and/or logged topics (History)
    // overlap with this opportunity's topic, by keyword.
    var topicSources = [];
    if (performance && performance.bestTopic) topicSources.push(performance.bestTopic);
    if (history && history.topics && history.topics.length) {
      topicSources = topicSources.concat(history.topics);
    }
    if (topicsOverlap(opportunity.topic, topicSources)) {
      bullets.push('Close to a topic that\u2019s already worked well for you.');
    }

    // Creator Learning: a specific "this exact learned pattern has worked
    // for you" bullet — distinct from the generic topic-overlap bullet
    // above, which only speaks in terms of the creator's stated best
    // topic/format. Only fires once there's enough measured Content
    // History to support it (learningSignals.hasEnoughData) and the
    // opportunity actually matches the learned pattern — never claims a
    // track record that doesn't exist yet (Prompt 14, requirement 7).
    var learning = context.learningSignals || null;
    if (learning && learning.hasEnoughData) {
      var learnedTopicHit = learning.strongestTopic && topicsOverlap(opportunity.topic, [learning.strongestTopic]);
      var normalizedLearnedFormat = learning.strongestFormat ? normalizeFormat(learning.strongestFormat) : null;
      var learnedFormatHit = normalizedLearnedFormat && contentTypeCompatible(normalizedLearnedFormat, opportunity.contentType);

      if (learnedTopicHit && learnedFormatHit) {
        bullets.push('Your previous ' + learning.strongestTopic + ' ' + learning.strongestFormat + ' content has performed strongly.');
      } else if (learnedTopicHit) {
        bullets.push('Your previous ' + learning.strongestTopic + ' content has performed strongly.');
      } else if (learnedFormatHit) {
        bullets.push('Your ' + learning.strongestFormat + ' content has performed strongly for you before.');
      }
    }

    // Real track record: only a positive claim, and only from the
    // creator's own logged results (never fabricated, never a guarantee).
    if (records.length && global.DraftzennHistory && global.DraftzennHistory.getPerformanceLabel) {
      var matching = records.filter(function (record) {
        var normalized = normalizeFormat(record.format);
        var formatOk = !record.format || contentTypeCompatible(normalized, opportunity.contentType);
        var platformOk = !record.platform || record.platform === opportunity.platform;
        return formatOk && platformOk;
      });
      var labels = matching
        .map(function (record) { return global.DraftzennHistory.getPerformanceLabel(record, records); })
        .filter(Boolean);
      if (labels.length) {
        var strongCount = labels.filter(function (l) { return l === 'Strong'; }).length;
        var lowCount = labels.filter(function (l) { return l === 'Low'; }).length;
        if (strongCount > lowCount) {
          bullets.push('Your content history shows stronger performance for similar content.');
        }
      }
    }

    // Platform experience: have they actually posted there before?
    if (history && history.platformCounts && history.platformCounts[opportunity.platform]) {
      bullets.push('You\u2019ve already posted on ' + opportunity.platform + ' before.');
    }

    // Opportunity's own attributes — always available, never personal, but
    // still a real reason it was surfaced.
    if (opportunity.audienceFit === 'Strong') {
      bullets.push('Strong audience fit for this kind of content.');
    }
    if (opportunity.competition === 'Low') {
      bullets.push('Relatively low competition right now.');
    }

    // Posting cadence: only mentioned when there's an actual logged
    // number behind it (Creator Performance or Content History).
    var postsPerWeek = null;
    if (performance && typeof performance.postsPerWeek === 'number') {
      postsPerWeek = performance.postsPerWeek;
    } else if (history && typeof history.postsPerWeek === 'number') {
      postsPerWeek = history.postsPerWeek;
    }
    if (typeof postsPerWeek === 'number' && postsPerWeek >= 2) {
      bullets.push('You post often enough for this to fit your current cadence.');
    }

    // NO-DATA / LOW-DATA FALLBACK
    // -------------------------------------------------------------------
    // If little or nothing above fired (weak profile overlap, no
    // performance/history signal), pad out to at least two bullets using
    // the opportunity's own plainly-stated attributes so the section is
    // never sparse — described as ratings, without implying any personal
    // track record. Skips anything already covered above.
    if (bullets.length < 2) {
      var fallbackPool = [
        { covered: opportunity.audienceFit === 'Strong', text: 'Audience fit for this opportunity is rated ' + (opportunity.audienceFit || 'Moderate') + '.' },
        { covered: opportunity.competition === 'Low', text: 'Competition for this opportunity is rated ' + (opportunity.competition || 'Medium') + '.' },
        { covered: false, text: 'This trend is currently rated ' + (opportunity.trendStrength || 'Building') + '.' }
      ];
      fallbackPool.forEach(function (item) {
        if (bullets.length < 2 && !item.covered) bullets.push(item.text);
      });
    }

    return bullets.slice(0, 4);
  }

  /**
   * Builds the concise "Why this score?" explanation from the structured
   * reasons collected while scoring — no AI, just templated text over
   * structured data, per the Radar's existing whyItMatters/suggestedAction
   * pattern.
   */
  function buildExplanation(hasPersonalData, reasons) {
    if (!hasPersonalData) {
      return 'Estimated score based on your profile and this opportunity\u2019s demo trend data \u2014 ' +
        'add Creator Performance or Content History for a fully personalized score.';
    }

    var positives = reasons
      .filter(function (r) { return r.dir === 'pos'; })
      .slice(0, 2)
      .map(function (r) { return REASON_TEXT[r.code]; })
      .filter(Boolean);

    var negatives = reasons
      .filter(function (r) { return r.dir === 'neg'; })
      .slice(0, 1)
      .map(function (r) { return REASON_TEXT[r.code]; })
      .filter(Boolean);

    var parts = [];
    if (positives.length) parts.push('Strong match because ' + joinList(positives) + '.');
    if (negatives.length) parts.push('Worth noting: ' + joinList(negatives) + '.');
    if (!parts.length) {
      parts.push('A moderate fit based on your niche, platform, and this opportunity\u2019s current trend strength.');
    }
    return parts.join(' ');
  }

  /**
   * Scores a single opportunity against a personalization context. See the
   * file header for the shapes of `opportunity` and `context`.
   */
  function scoreOpportunity(opportunity, context) {
    context = context || {};

    var trend = computeTrendComponent(opportunity);
    var audience = computeAudienceFit(opportunity, context.profile);
    var personal = computePersonalFit(opportunity, context);
    var competition = computeCompetitionComponent(opportunity);
    var hasPersonalData = personal.hasData;

    // When Personal Fit can't be computed, its weight is redistributed
    // across the other three components rather than defaulting Personal
    // Fit itself to some invented number.
    var weights = hasPersonalData
      ? { trend: 0.25, audience: 0.30, personal: 0.30, competition: 0.15 }
      : { trend: 0.35, audience: 0.40, personal: 0, competition: 0.25 };

    var overall = clamp(
      trend * weights.trend +
      audience.score * weights.audience +
      (hasPersonalData ? personal.score : 0) * weights.personal +
      competition * weights.competition
    );

    // Personal Fit reasons are listed first so buildExplanation() surfaces
    // them ahead of the more generic audience/competition/trend reasons —
    // "why this score" should lead with what's specific to this creator.
    var reasons = [].concat(personal.reasons, audience.reasons, competitionReasons(opportunity), trendReasons(opportunity));

    return {
      overall: overall,
      breakdown: {
        opportunity: trend,
        audienceFit: audience.score,
        personalFit: hasPersonalData ? personal.score : null,
        competition: competition
      },
      isEstimated: !hasPersonalData,
      hasPersonalData: hasPersonalData,
      reasons: reasons,
      explanation: buildExplanation(hasPersonalData, reasons),
      // "Why this recommended to you?" — separate from the score
      // explanation above; see buildRecommendationReasons() for details.
      recommendationReasons: buildRecommendationReasons(opportunity, context)
    };
  }

  /**
   * Scores a full opportunity list. Returns shallow clones — the original
   * `opportunities` array/objects (e.g. window.DraftzennRadarData.opportunities)
   * are never mutated, so re-scoring after a profile/performance/history
   * change is always a clean recompute from the same source data.
   */
  function scoreOpportunities(opportunities, context) {
    return (opportunities || []).map(function (opportunity) {
      var result = scoreOpportunity(opportunity, context);
      var clone = {};
      Object.keys(opportunity).forEach(function (key) { clone[key] = opportunity[key]; });

      clone.demoOpportunityScore = opportunity.opportunityScore;
      clone.opportunityScore = result.overall;
      clone.scoreBreakdown = result.breakdown;
      clone.scoreIsEstimated = result.isEstimated;
      clone.scoreExplanation = result.explanation;
      clone.recommendationReasons = result.recommendationReasons;

      return clone;
    });
  }

  global.DraftzennRadarScoring = {
    scoreOpportunity: scoreOpportunity,
    scoreOpportunities: scoreOpportunities,
    // Exposed individually so a future real trend-data system can reuse
    // just the pieces it needs without rebuilding this file.
    computeTrendComponent: computeTrendComponent,
    computeCompetitionComponent: computeCompetitionComponent,
    computeAudienceFit: computeAudienceFit,
    computePersonalFit: computePersonalFit,
    normalizeFormat: normalizeFormat,
    // "Why this recommended to you?" — usable standalone (e.g. by
    // opportunity-details.js's raw-data fallback) without recomputing a
    // full score.
    buildRecommendationReasons: buildRecommendationReasons
  };
})(window);
