/**
 * Draftzenn — Opportunity Details
 * ---------------------------------------------------------------------------
 * A single modal, shared by every opportunity card on the page (Creator
 * Radar's "Recommended for You" strip and "All Opportunities" grid). Clicking
 * or Enter/Space-ing any card with a `data-opportunity-id` opens it, looks
 * the opportunity up in `DraftzennRadarData.opportunities` (the single
 * source of truth — see js/radar-data.js), and renders its full detail.
 *
 * "Plan This Content" adds the opportunity's id to the shared plan store
 * (js/plan-data.js) and flips the button to a disabled "Added to Plan"
 * state plus a "View My Content Plan" link — matching the flow into
 * js/content-plan.js's My Content Plan section.
 *
 * The opportunity itself is looked up via DraftzennRadar.findScored(id)
 * (js/creator-radar.js) rather than directly off DraftzennRadarData, so the
 * modal shows the same personalized score/breakdown/explanation
 * (js/radar-scoring.js) as the card that was clicked — falling back to the
 * raw demo data only if the Radar module isn't available for some reason.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var els = {};
  var currentOpportunity = null;
  var lastFocusedEl = null;

  document.addEventListener('DOMContentLoaded', function () {
    els.overlay = document.querySelector('[data-opportunity-modal]');
    if (!els.overlay) return; // Modal isn't on this page.

    els.dialog = els.overlay.querySelector('[data-opportunity-modal-dialog]');
    els.platform = els.overlay.querySelector('[data-modal-platform]');
    els.topic = els.overlay.querySelector('[data-modal-topic]');
    els.tags = els.overlay.querySelector('[data-modal-tags]');
    els.scoreBadge = els.overlay.querySelector('[data-modal-score-badge]');
    els.scoreText = els.overlay.querySelector('[data-modal-score-text]');
    els.breakdown = els.overlay.querySelector('[data-modal-breakdown]');
    els.scoreWhy = els.overlay.querySelector('[data-modal-score-why]');
    els.recommend = els.overlay.querySelector('[data-modal-recommend]');
    els.why = els.overlay.querySelector('[data-modal-why]');
    els.format = els.overlay.querySelector('[data-modal-format]');
    els.action = els.overlay.querySelector('[data-modal-action]');
    els.planBtn = els.overlay.querySelector('[data-opportunity-plan-btn]');
    els.viewPlanLink = els.overlay.querySelector('[data-opportunity-view-plan-link]');
    els.closeBtn = els.overlay.querySelector('[data-opportunity-modal-close]');
    els.closeBtn2 = els.overlay.querySelector('[data-opportunity-modal-close-btn]');

    // Delegated so it works for cards rendered/re-rendered by
    // js/creator-radar.js at any point, without re-binding listeners.
    document.addEventListener('click', function (evt) {
      var card = evt.target.closest('[data-opportunity-id]');
      if (card) {
        openModal(card.getAttribute('data-opportunity-id'));
        return;
      }
      if (evt.target === els.overlay) closeModal();
    });

    document.addEventListener('keydown', function (evt) {
      if (evt.key !== 'Enter' && evt.key !== ' ') return;
      var card = evt.target.closest('[data-opportunity-id]');
      if (!card) return;
      evt.preventDefault();
      openModal(card.getAttribute('data-opportunity-id'));
    });

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && !els.overlay.hidden) closeModal();
    });

    if (els.closeBtn) els.closeBtn.addEventListener('click', closeModal);
    if (els.closeBtn2) els.closeBtn2.addEventListener('click', closeModal);
    if (els.viewPlanLink) els.viewPlanLink.addEventListener('click', closeModal);

    if (els.planBtn) {
      els.planBtn.addEventListener('click', function () {
        if (!currentOpportunity || !global.DraftzennPlan) return;
        DraftzennPlan.addToPlan(currentOpportunity.id);
        renderPlanState(currentOpportunity.id);
      });
    }
  });

  function findOpportunity(id) {
    if (global.DraftzennRadar && global.DraftzennRadar.findScored) {
      var scored = global.DraftzennRadar.findScored(id);
      if (scored) return scored;
    }
    // Fallback: raw demo data, unscored (shouldn't normally be needed).
    var data = global.DraftzennRadarData;
    if (!data) return null;
    var found = null;
    data.opportunities.some(function (o) {
      if (o.id === id) { found = o; return true; }
      return false;
    });
    return found;
  }

  function openModal(id) {
    var o = findOpportunity(id);
    if (!o || !els.overlay) return;
    currentOpportunity = o;

    if (els.platform) els.platform.textContent = o.platform + ' \u00b7 ' + o.niche;
    if (els.topic) els.topic.textContent = o.topic;
    if (els.tags) {
      els.tags.innerHTML =
        (o.scoreIsEstimated ? '<span class="tag estimated-pill">Estimated score</span>' : '') +
        '<span class="tag status-pill ' + statusClass(o.status) + '">' + escapeHtml(o.status) + '</span>' +
        '<span class="tag">Trend: ' + escapeHtml(o.trendStrength) + '</span>' +
        '<span class="tag">Competition: ' + escapeHtml(o.competition) + '</span>' +
        '<span class="tag">Audience fit: ' + escapeHtml(o.audienceFit) + '</span>';
    }
    if (els.scoreBadge) {
      els.scoreBadge.textContent = String(o.opportunityScore);
      els.scoreBadge.className = 'opportunity-score ' + scoreClass(o.opportunityScore);
    }
    if (els.scoreText) {
      els.scoreText.textContent = o.opportunityScore + ' / 100' +
        (o.scoreIsEstimated ? ' \u00b7 Estimated (demo) score' : ' \u00b7 Personalized for you');
    }
    if (els.breakdown) els.breakdown.innerHTML = renderBreakdown(o.scoreBreakdown);
    if (els.scoreWhy) els.scoreWhy.textContent = o.scoreExplanation || '';
    if (els.recommend) els.recommend.innerHTML = renderRecommendReasons(o);
    if (els.why) els.why.textContent = o.whyItMatters;
    if (els.format) els.format.textContent = o.contentType + ' on ' + o.platform;
    if (els.action) els.action.textContent = o.suggestedAction;

    renderPlanState(o.id);

    lastFocusedEl = document.activeElement;
    els.overlay.hidden = false;
    document.body.classList.add('modal-open');
    if (els.closeBtn) els.closeBtn.focus();
  }

  function closeModal() {
    if (!els.overlay) return;
    els.overlay.hidden = true;
    document.body.classList.remove('modal-open');
    currentOpportunity = null;
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
  }

  function renderPlanState(id) {
    if (!els.planBtn) return;
    var planned = !!(global.DraftzennPlan && DraftzennPlan.isPlanned(id));

    if (planned) {
      els.planBtn.textContent = '\u2713 Added to Plan';
      els.planBtn.classList.remove('btn-primary');
      els.planBtn.classList.add('btn-ghost', 'btn-planned');
      els.planBtn.disabled = true;
      if (els.viewPlanLink) els.viewPlanLink.style.display = '';
    } else {
      els.planBtn.textContent = 'Plan This Content';
      els.planBtn.classList.remove('btn-ghost', 'btn-planned');
      els.planBtn.classList.add('btn-primary');
      els.planBtn.disabled = false;
      if (els.viewPlanLink) els.viewPlanLink.style.display = 'none';
    }
  }

  /**
   * "Why this recommended to you?" — renders the creator-specific reasons
   * computed alongside the score (js/radar-scoring.js's
   * buildRecommendationReasons(), via .recommendationReasons on the scored
   * opportunity). Kept separate from renderBreakdown()/"Why this score?"
   * below — this explains why the opportunity was picked for this
   * creator, not how its number was calculated.
   *
   * Falls back to computing reasons on the fly (empty context) only in the
   * rare case findOpportunity() had to use the raw/unscored demo data —
   * normally DraftzennRadar.findScored() already attached this array.
   */
  function renderRecommendReasons(o) {
    var reasons = o.recommendationReasons;
    if (!reasons && global.DraftzennRadarScoring && global.DraftzennRadarScoring.buildRecommendationReasons) {
      reasons = global.DraftzennRadarScoring.buildRecommendationReasons(o, {});
    }
    if (!reasons || !reasons.length) {
      reasons = ['Based on your profile and this opportunity\u2019s attributes.'];
    }
    return reasons.map(function (reason) {
      return '<li>' + escapeHtml(reason) + '</li>';
    }).join('');
  }

  /**
   * Same 4-number Opportunity / Audience Fit / Personal Fit / Competition
   * breakdown shown on the cards (js/creator-radar.js's renderScoreBreakdown)
   * — duplicated here in miniature since this modal is its own module.
   */
  function renderBreakdown(breakdown) {
    if (!breakdown) return '';
    return (
      breakdownItem('Opportunity', breakdown.opportunity) +
      breakdownItem('Audience Fit', breakdown.audienceFit) +
      breakdownItem('Personal Fit', breakdown.personalFit) +
      breakdownItem('Competition', breakdown.competition)
    );
  }

  function breakdownItem(label, value) {
    var display = (value === null || value === undefined) ? '\u2014' : String(value);
    return (
      '<div class="score-breakdown-item">' +
        '<span class="score-breakdown-value">' + escapeHtml(display) + '</span>' +
        '<span class="score-breakdown-label">' + escapeHtml(label) + '</span>' +
      '</div>'
    );
  }

  function scoreClass(score) {
    return score >= 80 ? 'score-high' : (score >= 60 ? 'score-mid' : 'score-low');
  }

  function statusClass(status) {
    return { Emerging: 'status-emerging', Rising: 'status-rising', Hot: 'status-hot' }[status] || 'status-emerging';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})(window);
