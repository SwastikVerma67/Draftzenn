/**
 * Draftzenn — Creator Radar
 * ---------------------------------------------------------------------------
 * Renders the Creator Radar section: a Radar Overview (platform, niche,
 * opportunity count, overall status), a "Recommended for You" strip, quick
 * filters, the full opportunity grid — and drives the page-level "Your Next
 * Move" card that sits above the Radar on the dashboard.
 *
 * This file only knows how to render an array of opportunities shaped per
 * the contract documented in js/radar-data.js — it never hardcodes demo
 * content itself. To wire in real data later:
 *
 *   DraftzennRadar.setOpportunities(realOpportunitiesArray);
 *
 * ...and everything (overview, stats, filters, recommended strip, next
 * move, grid) re-renders automatically. No other changes needed here or in
 * dashboard.html.
 *
 * Personalization:
 *   DraftzennRadar.setProfile(profile);
 *
 * `profile` is the object returned by DraftzennProfile.getProfile()
 * (see js/profile-provider.js): { creatorName, platform, niche, contentType }.
 * When a profile is set, every opportunity gets a match score against it
 * (niche + platform + content type). That match score drives:
 *   - the Radar Overview's platform/niche/count/status line
 *   - the "Recommended for You" strip
 *   - the "Matches your profile" badge
 * Call setProfile(null) to clear personalization (falls back to plain
 * opportunity-score ranking, unfiltered by niche/platform).
 *
 * Personalized scoring (js/radar-scoring.js):
 *   Every opportunity's displayed score/badge/sort order — including
 *   "Highest Opportunity", "Your Next Move", and the score badge on every
 *   card — comes from DraftzennRadarScoring.scoreOpportunities(), which
 *   folds in the creator's saved profile, Creator Performance
 *   (js/performance-data.js), and Content History
 *   (js/content-history-data.js) on top of each opportunity's own trend/
 *   competition/audience-fit data. This module fetches that Performance/
 *   History data itself (via refreshPersonalization(), below) and re-scores
 *   and re-renders automatically whenever either changes — no page reload
 *   needed. Call DraftzennRadar.refreshPersonalization() to force a refetch
 *   (e.g. right after a profile save elsewhere on the page).
 *
 * Creator Learning (js/creator-learning.js):
 *   refreshPersonalization() also derives learningSignals from the same
 *   Content History fetch (a pure, synchronous reduction — no extra
 *   round-trip) and folds it into the same personalization context, so
 *   Personal Fit and "Why this recommended to you?" can reflect learned
 *   patterns. renderLearning() renders the small "Creator Learning" panel
 *   from those signals, showing an honest empty-state message instead of
 *   inventing a pattern when there isn't enough measured (Published/
 *   Tested) history yet.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var STATUS_CLASS = {
    Emerging: 'status-emerging',
    Rising: 'status-rising',
    Hot: 'status-hot'
  };

  var AUDIENCE_FIT_CLASS = {
    Strong: 'fit-strong',
    Moderate: 'fit-moderate',
    Early: 'fit-early'
  };

  // An opportunity counts as "worth testing" for the overview headline once
  // it clears this score. Demo-data threshold — a real backend could send
  // this down instead once it exists.
  var WORTH_TESTING_THRESHOLD = 70;

  var QUICK_FILTERS = {
    all: { label: 'All', test: function () { return true; } },
    highest: { label: 'Highest Opportunity', test: function (o) { return o.opportunityScore >= 80; } },
    rising: { label: 'Rising', test: function (o) { return o.status === 'Rising' || o.status === 'Hot'; } },
    lowcomp: { label: 'Low Competition', test: function (o) { return o.competition === 'Low'; } }
  };

  var state = {
    opportunities: [],   // raw opportunities, exactly as provided by setOpportunities()
    scored: [],          // same list, personalized via DraftzennRadarScoring — this is
                          // what every render/sort/filter function below reads from
    profile: null,
    performanceSnapshot: null,
    historySnapshot: null,
    historyRecords: [],
    learningSignals: null,
    quickFilter: 'all',
    filters: { platform: 'all', niche: 'all', status: 'all' }
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', function () {
    els.root = document.querySelector('[data-radar-root]');
    if (!els.root) return; // Creator Radar isn't on this page.

    els.overview = els.root.querySelector('[data-radar-overview]');
    els.overviewPlatform = els.root.querySelector('[data-radar-overview-platform]');
    els.overviewNiche = els.root.querySelector('[data-radar-overview-niche]');
    els.overviewCount = els.root.querySelector('[data-radar-overview-count]');
    els.overviewStatus = els.root.querySelector('[data-radar-overview-status]');

    els.stats = els.root.querySelector('[data-radar-stats]');
    els.learning = {
      root: els.root.querySelector('[data-learning-root]'),
      list: els.root.querySelector('[data-learning-list]'),
      empty: els.root.querySelector('[data-learning-empty]')
    };
    els.recommendedSection = els.root.querySelector('[data-radar-recommended-section]');
    els.recommendedGrid = els.root.querySelector('[data-radar-recommended-grid]');
    els.recommendedSub = els.root.querySelector('[data-radar-recommended-sub]');
    els.grid = els.root.querySelector('[data-radar-grid]');
    els.count = els.root.querySelector('[data-radar-count]');
    els.empty = els.root.querySelector('[data-radar-empty]');
    els.quickFilterBar = els.root.querySelector('[data-radar-quick-filters]');
    els.platformFilter = els.root.querySelector('[data-filter="platform"]');
    els.nicheFilter = els.root.querySelector('[data-filter="niche"]');
    els.statusFilter = els.root.querySelector('[data-filter="status"]');
    els.resetBtn = els.root.querySelector('[data-radar-reset]');

    // "Your Next Move" lives at the top of the dashboard, outside the Radar
    // section itself, so it's looked up on `document` rather than els.root.
    els.nextMove = {
      root: document.querySelector('[data-next-move-root]'),
      scoreRing: document.querySelector('[data-next-move-score-ring]'),
      score: document.querySelector('[data-next-move-score]'),
      topic: document.querySelector('[data-next-move-topic]'),
      why: document.querySelector('[data-next-move-why]'),
      format: document.querySelector('[data-next-move-format]'),
      action: document.querySelector('[data-next-move-action]'),
      platform: document.querySelector('[data-next-move-platform]'),
      trend: document.querySelector('[data-next-move-trend]'),
      competition: document.querySelector('[data-next-move-competition]')
    };

    var data = global.DraftzennRadarData;
    if (data) {
      populateFilterOptions(data.platforms, data.niches, data.statuses);
      setOpportunities(data.opportunities, data.weeklyDeltas);
    }

    if (els.quickFilterBar) {
      els.quickFilterBar.addEventListener('click', function (evt) {
        var btn = evt.target.closest('[data-quick-filter]');
        if (!btn) return;
        state.quickFilter = btn.getAttribute('data-quick-filter');
        updateQuickFilterButtons();
        renderGrid();
      });
    }

    [els.platformFilter, els.nicheFilter, els.statusFilter].forEach(function (select) {
      if (!select) return;
      select.addEventListener('change', function () {
        state.filters[select.getAttribute('data-filter')] = select.value;
        renderGrid();
      });
    });

    if (els.resetBtn) {
      els.resetBtn.addEventListener('click', function () {
        state.filters = { platform: 'all', niche: 'all', status: 'all' };
        state.quickFilter = 'all';
        [els.platformFilter, els.nicheFilter, els.statusFilter].forEach(function (select) {
          if (select) select.value = 'all';
        });
        updateQuickFilterButtons();
        renderGrid();
      });
    }

    // Keep the "Added to plan" badge on cards in sync with the plan store —
    // e.g. right after "Plan This Content" is used in the Opportunity
    // Details modal (see js/opportunity-details.js).
    if (global.DraftzennPlan) {
      DraftzennPlan.onChange(function () {
        renderRecommended();
        renderGrid();
      });
    }

    // Personalized scoring inputs: fetch once now, and re-fetch + re-score
    // + re-render automatically any time Creator Performance or Content
    // History changes — no reload needed (LIVE UPDATES requirement).
    refreshPersonalization();
    if (global.DraftzennPerformance) DraftzennPerformance.onChange(refreshPersonalization);
    if (global.DraftzennHistory) DraftzennHistory.onChange(refreshPersonalization);
  });

  /**
   * Public entry point (also called internally): re-fetches the current
   * user's saved Performance snapshot + full Content History, then
   * re-scores every opportunity and re-renders. Safe to call any time —
   * e.g. dashboard.js can call it again right after the profile resolves,
   * in case this ran once before auth was ready. Failures (e.g. not signed
   * in yet) just leave personalization data as null/empty rather than
   * throwing, so the Radar keeps showing something rather than breaking.
   */
  function refreshPersonalization() {
    var performancePromise = global.DraftzennPerformance
      ? DraftzennPerformance.getPerformanceSnapshot().catch(function () { return null; })
      : Promise.resolve(null);

    var historySnapshotPromise = global.DraftzennHistory
      ? DraftzennHistory.getHistorySnapshot().catch(function () { return null; })
      : Promise.resolve(null);

    var historyRecordsPromise = global.DraftzennHistory
      ? DraftzennHistory.getHistory().catch(function () { return []; })
      : Promise.resolve([]);

    return Promise.all([performancePromise, historySnapshotPromise, historyRecordsPromise])
      .then(function (results) {
        state.performanceSnapshot = results[0];
        state.historySnapshot = results[1];
        state.historyRecords = results[2] || [];

        // Creator Learning signals (js/creator-learning.js) are a pure,
        // synchronous function of Content History, so they're derived
        // right here from the records already fetched above instead of a
        // separate async round-trip. cacheLearningSignals() persists the
        // last computed snapshot to localStorage (keyed by user) purely
        // as read-your-own-write convenience — Content History remains
        // the actual source of truth.
        state.learningSignals = (global.DraftzennLearning && global.DraftzennLearning.computeLearningSignals)
          ? global.DraftzennLearning.computeLearningSignals(state.historyRecords)
          : null;
        if (global.DraftzennLearning && global.DraftzennLearning.cacheLearningSignals) {
          global.DraftzennLearning.cacheLearningSignals(state.learningSignals);
        }

        rescoreAndRender();
      });
  }

  /**
   * Recomputes state.scored from state.opportunities + the current
   * personalization context, then re-renders everything that depends on
   * scores. This is the single place opportunities get personalized —
   * called whenever the opportunity list, profile, performance, or history
   * changes.
   */
  function rescoreAndRender() {
    var context = {
      profile: state.profile,
      performanceSnapshot: state.performanceSnapshot,
      historySnapshot: state.historySnapshot,
      historyRecords: state.historyRecords,
      learningSignals: state.learningSignals
    };

    state.scored = (global.DraftzennRadarScoring && global.DraftzennRadarScoring.scoreOpportunities)
      ? global.DraftzennRadarScoring.scoreOpportunities(state.opportunities, context)
      : state.opportunities; // safety net if the scoring module failed to load

    renderOverview();
    renderStats(state.lastDeltas);
    renderLearning();
    renderRecommended();
    renderNextMove();
    renderGrid();
  }

  /**
   * Creator Learning panel — a small, transparent summary of patterns
   * computed from the creator's own measured (Published/Tested) Content
   * History (js/creator-learning.js). Shows an honest empty-state message
   * instead of bullets whenever there isn't enough data yet; never
   * fabricates a pattern. Re-runs any time Content History changes, same
   * as the rest of personalization (see DraftzennHistory.onChange below).
   */
  function renderLearning() {
    var ui = els.learning;
    if (!ui || !ui.root) return;

    var result = (global.DraftzennLearning && global.DraftzennLearning.getSummaryBullets)
      ? global.DraftzennLearning.getSummaryBullets(state.learningSignals)
      : { bullets: [], emptyMessage: 'Keep publishing and testing content. Draftzenn will learn your strongest patterns as more results are recorded.' };

    if (result.emptyMessage) {
      if (ui.list) ui.list.innerHTML = '';
      if (ui.empty) {
        ui.empty.textContent = result.emptyMessage;
        ui.empty.style.display = '';
      }
      return;
    }

    if (ui.empty) ui.empty.style.display = 'none';
    if (ui.list) {
      ui.list.innerHTML = result.bullets.map(function (b) {
        return '<li>' + escapeHtml(b) + '</li>';
      }).join('');
    }
  }

  /**
   * Public entry point for swapping in real data later. `deltas` is optional
   * flavor text for the stat cards (e.g. "+5 this week") — pass {} to fall
   * back to plain counts with no trend copy.
   */
  function setOpportunities(opportunities, deltas) {
    state.opportunities = opportunities || [];
    state.lastDeltas = deltas || {};
    rescoreAndRender();
  }

  /**
   * Public entry point — call once the signed-in creator's saved profile
   * (from DraftzennProfile.getProfile()) is known, and again any time it
   * changes (e.g. right after Edit Profile saves). Pass null/undefined to
   * clear personalization.
   */
  function setProfile(profile) {
    state.profile = profile || null;
    rescoreAndRender();
  }

  function populateFilterOptions(platforms, niches, statuses) {
    fillSelect(els.platformFilter, platforms, 'All platforms');
    fillSelect(els.nicheFilter, niches, 'All niches');
    fillSelect(els.statusFilter, statuses, 'All statuses');
  }

  function fillSelect(select, values, allLabel) {
    if (!select) return;
    var html = '<option value="all">' + allLabel + '</option>';
    (values || []).forEach(function (v) {
      html += '<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + '</option>';
    });
    select.innerHTML = html;
  }

  function updateQuickFilterButtons() {
    if (!els.quickFilterBar) return;
    var buttons = els.quickFilterBar.querySelectorAll('[data-quick-filter]');
    buttons.forEach(function (btn) {
      var isActive = btn.getAttribute('data-quick-filter') === state.quickFilter;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /**
   * Opportunities relevant to the signed-in creator's saved niche/platform —
   * falls back to the full demo set when there's no profile yet. This is
   * the pool the Radar Overview headline and "worth testing" count draw
   * from, so the summary never references opportunities that don't fit the
   * creator at all.
   */
  function relevantOpportunities() {
    var profile = state.profile;
    if (!profile) return state.scored;
    return state.scored.filter(function (o) {
      return (profile.niche && o.niche === profile.niche) ||
        (profile.platform && o.platform === profile.platform);
    });
  }

  function renderOverview() {
    if (!els.overview) return;

    var profile = state.profile;
    var pool = relevantOpportunities();
    var worthTesting = pool.filter(function (o) { return o.opportunityScore >= WORTH_TESTING_THRESHOLD; });

    if (els.overviewPlatform) {
      els.overviewPlatform.textContent = profile ? profile.platform : 'All platforms';
    }
    if (els.overviewNiche) {
      els.overviewNiche.textContent = profile ? profile.niche : 'All niches';
    }
    if (els.overviewCount) {
      els.overviewCount.textContent = String(pool.length);
    }
    if (els.overviewStatus) {
      var statusText;
      if (!pool.length) {
        statusText = 'No opportunities scanned yet for this niche.';
      } else if (worthTesting.length) {
        statusText = worthTesting.length + ' ' + (worthTesting.length === 1 ? 'opportunity' : 'opportunities') + ' worth testing right now';
      } else {
        statusText = 'Nothing clears the bar yet — worth checking back after the next scan.';
      }
      els.overviewStatus.textContent = statusText;
    }
  }

  function renderStats(deltas) {
    if (!els.stats) return;

    var total = state.scored.length;
    var avgScore = total
      ? Math.round(state.scored.reduce(function (sum, o) { return sum + o.opportunityScore; }, 0) / total)
      : 0;
    var nicheCount = uniqueValues(state.scored, 'niche').length;
    var platformNames = uniqueValues(state.scored, 'platform');

    var stats = [
      { value: total, label: 'Opportunities found', delta: deltas.opportunitiesFound },
      { value: avgScore, label: 'Avg. opportunity score', delta: deltas.avgScore },
      { value: nicheCount, label: 'Niches watched', delta: deltas.nichesWatched },
      { value: platformNames.length, label: 'Platforms covered', delta: deltas.platformsCovered || platformNames.join(', ') }
    ];

    els.stats.innerHTML = stats.map(function (s) {
      var deltaClass = s.delta ? '' : ' delta-neutral';
      return (
        '<div class="radar-stat">' +
          '<p class="value">' + escapeHtml(String(s.value)) + '</p>' +
          '<p class="label">' + escapeHtml(s.label) + '</p>' +
          '<p class="delta' + deltaClass + '">' + escapeHtml(s.delta || '\u2014') + '</p>' +
        '</div>'
      );
    }).join('');
  }

  /**
   * How well an opportunity fits the creator's saved profile. Higher is
   * better; 0 means "no profile" or "no overlap at all". Niche match counts
   * most, platform next, content type is a smaller tiebreaker (a creator
   * who makes "Both" is compatible with anything, and vice versa).
   */
  function matchScore(o, profile) {
    if (!profile) return 0;
    var score = 0;
    if (profile.niche && o.niche === profile.niche) score += 2;
    if (profile.platform && o.platform === profile.platform) score += 1;
    if (profile.contentType && o.contentType) {
      if (o.contentType === profile.contentType || o.contentType === 'Both' || profile.contentType === 'Both') {
        score += 1;
      }
    }
    return score;
  }

  /**
   * The single strongest opportunity for the current creator: best profile
   * match first, highest opportunity score as the tiebreak. Falls back to
   * the plain highest-scoring opportunity when there's no profile yet.
   */
  function bestOpportunity() {
    if (!state.scored.length) return null;
    var profile = state.profile;
    var ranked = state.scored.slice().sort(function (a, b) {
      var scoreDiff = matchScore(b, profile) - matchScore(a, profile);
      if (scoreDiff !== 0) return scoreDiff;
      return b.opportunityScore - a.opportunityScore;
    });
    return ranked[0];
  }

  function renderNextMove() {
    var nm = els.nextMove;
    if (!nm || !nm.root) return;

    var top = bestOpportunity();
    if (!top) {
      nm.root.style.display = 'none';
      return;
    }

    nm.root.style.display = '';
    if (nm.scoreRing) nm.scoreRing.style.setProperty('--score', String(top.opportunityScore));
    if (nm.score) nm.score.textContent = String(top.opportunityScore);
    if (nm.topic) nm.topic.textContent = top.topic;
    if (nm.why) nm.why.textContent = top.whyItMatters;
    if (nm.format) nm.format.textContent = top.contentType + ' on ' + top.platform;
    if (nm.action) nm.action.textContent = top.suggestedAction;
    if (nm.platform) nm.platform.textContent = top.platform + ' \u00b7 ' + top.niche;
    if (nm.trend) nm.trend.textContent = top.status + ' \u00b7 ' + top.trendStrength + ' trend';
    if (nm.competition) nm.competition.textContent = top.competition + ' competition';
  }

  function renderRecommended() {
    if (!els.recommendedGrid || !els.recommendedSection) return;

    var profile = state.profile;
    var withScores = state.scored.map(function (o) {
      return { o: o, score: matchScore(o, profile) };
    });

    withScores.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.o.opportunityScore - a.o.opportunityScore;
    });

    // Fall back to the static `recommended` flag only when there's no
    // profile at all AND nothing scored (keeps old demo behavior intact).
    var hasProfileSignal = withScores.some(function (w) { return w.score > 0; });
    var top;
    if (hasProfileSignal) {
      top = withScores.slice(0, 3).map(function (w) { return w.o; });
    } else {
      top = state.scored
        .filter(function (o) { return o.recommended; })
        .sort(function (a, b) { return b.opportunityScore - a.opportunityScore; })
        .slice(0, 3);
    }

    if (!top.length) {
      els.recommendedSection.style.display = 'none';
      return;
    }

    if (els.recommendedSub) {
      els.recommendedSub.textContent = profile
        ? 'Matched to ' + profile.niche + ' on ' + profile.platform
        : 'Matched to your niche & platforms';
    }

    els.recommendedSection.style.display = '';
    els.recommendedGrid.innerHTML = top.map(function (o) {
      return renderCard(o, matchScore(o, profile) > 0);
    }).join('');
  }

  function renderGrid() {
    if (!els.grid) return;

    var profile = state.profile;
    var quickTest = (QUICK_FILTERS[state.quickFilter] || QUICK_FILTERS.all).test;

    var filtered = state.scored.filter(function (o) {
      var f = state.filters;
      return (f.platform === 'all' || o.platform === f.platform) &&
        (f.niche === 'all' || o.niche === f.niche) &&
        (f.status === 'all' || o.status === f.status) &&
        quickTest(o);
    });

    filtered.sort(function (a, b) {
      var scoreDiff = matchScore(b, profile) - matchScore(a, profile);
      if (scoreDiff !== 0) return scoreDiff;
      return b.opportunityScore - a.opportunityScore;
    });

    if (els.count) {
      els.count.textContent = filtered.length + (filtered.length === 1 ? ' result' : ' results');
    }

    if (!filtered.length) {
      els.grid.innerHTML = '';
      if (els.empty) els.empty.style.display = '';
      return;
    }

    if (els.empty) els.empty.style.display = 'none';
    els.grid.innerHTML = filtered.map(function (o) {
      return renderCard(o, matchScore(o, profile) > 0);
    }).join('');
  }

  function renderCard(o, isMatched) {
    var scoreClass = o.opportunityScore >= 80 ? 'score-high' : (o.opportunityScore >= 60 ? 'score-mid' : 'score-low');
    var statusClass = STATUS_CLASS[o.status] || 'status-emerging';
    var fitClass = AUDIENCE_FIT_CLASS[o.audienceFit] || 'fit-moderate';
    var isPlanned = !!(global.DraftzennPlan && DraftzennPlan.isPlanned(o.id));
    var cardClass = 'opportunity-card' + (isMatched ? ' is-matched' : '');

    return (
      '<article class="' + cardClass + '" data-opportunity-id="' + escapeAttr(o.id) + '" tabindex="0" role="button" ' +
        'aria-label="View details for ' + escapeAttr(o.topic) + '">' +
        '<div class="opportunity-top">' +
          '<div>' +
            '<p class="opportunity-platform">' + escapeHtml(o.platform) + ' \u00b7 ' + escapeHtml(o.niche) + '</p>' +
            '<h3>' + escapeHtml(o.topic) + '</h3>' +
          '</div>' +
          '<div class="opportunity-score ' + scoreClass + '" title="Opportunity score">' + escapeHtml(String(o.opportunityScore)) + '</div>' +
        '</div>' +

        '<div class="opportunity-tags">' +
          (isPlanned ? '<span class="tag planned-pill">\u2713 In your plan</span>' : '') +
          (isMatched ? '<span class="tag match-pill">Matches your profile</span>' : '') +
          (o.scoreIsEstimated ? '<span class="tag estimated-pill">Estimated score</span>' : '') +
          '<span class="tag status-pill ' + statusClass + '">' + escapeHtml(o.status) + '</span>' +
          '<span class="tag">Trend: ' + escapeHtml(o.trendStrength) + '</span>' +
          '<span class="tag">Competition: ' + escapeHtml(o.competition) + '</span>' +
          '<span class="tag fit-pill ' + fitClass + '">Audience fit: ' + escapeHtml(o.audienceFit) + '</span>' +
        '</div>' +

        renderScoreBreakdown(o.scoreBreakdown) +

        '<div class="opportunity-detail">' +
          '<p class="opportunity-detail-label">Why it matters</p>' +
          '<p>' + escapeHtml(o.whyItMatters) + '</p>' +
        '</div>' +

        '<div class="opportunity-detail">' +
          '<p class="opportunity-detail-label">Why this score?</p>' +
          '<p>' + escapeHtml(o.scoreExplanation || '') + '</p>' +
        '</div>' +

        '<div class="opportunity-detail">' +
          '<p class="opportunity-detail-label">Recommended next move</p>' +
          '<p>' + escapeHtml(o.suggestedAction) + '</p>' +
        '</div>' +
      '</article>'
    );
  }

  /**
   * Compact 4-number breakdown strip — Opportunity / Audience Fit /
   * Personal Fit / Competition — shown on every card and (via
   * js/opportunity-details.js) the details modal. `breakdown` matches
   * DraftzennRadarScoring's `.scoreBreakdown` shape; `personalFit` may be
   * `null` when the creator has no Performance/Content History data yet.
   */
  function renderScoreBreakdown(breakdown) {
    if (!breakdown) return '';
    return (
      '<div class="score-breakdown">' +
        scoreBreakdownItem('Opportunity', breakdown.opportunity) +
        scoreBreakdownItem('Audience Fit', breakdown.audienceFit) +
        scoreBreakdownItem('Personal Fit', breakdown.personalFit) +
        scoreBreakdownItem('Competition', breakdown.competition) +
      '</div>'
    );
  }

  function scoreBreakdownItem(label, value) {
    var display = (value === null || value === undefined) ? '\u2014' : String(value);
    return (
      '<div class="score-breakdown-item">' +
        '<span class="score-breakdown-value">' + escapeHtml(display) + '</span>' +
        '<span class="score-breakdown-label">' + escapeHtml(label) + '</span>' +
      '</div>'
    );
  }

  function uniqueValues(list, key) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      if (!seen[item[key]]) {
        seen[item[key]] = true;
        out.push(item[key]);
      }
    });
    return out;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  /**
   * Looks up one opportunity by id from the currently-scored list (i.e.
   * with personalized .opportunityScore, .scoreBreakdown, .scoreIsEstimated,
   * .scoreExplanation already applied). Used by js/opportunity-details.js
   * so the modal shows the same personalized numbers as the card that was
   * clicked, rather than the raw demo data.
   */
  function findScored(id) {
    var found = null;
    state.scored.some(function (o) {
      if (o.id === id) { found = o; return true; }
      return false;
    });
    return found;
  }

  global.DraftzennRadar = {
    setOpportunities: setOpportunities,
    setProfile: setProfile,
    refreshPersonalization: refreshPersonalization,
    findScored: findScored
  };
})(window);
