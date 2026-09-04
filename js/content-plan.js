/**
 * Draftzenn — My Content Plan
 * ---------------------------------------------------------------------------
 * Renders the "My Content Plan" section: every opportunity currently in the
 * shared plan store (js/plan-data.js), cross-referenced against the single
 * opportunity data source (js/radar-data.js) so there's no duplicate
 * opportunity data system. Re-renders automatically whenever the plan
 * changes (e.g. right after "Plan This Content" in the Opportunity Details
 * modal — see js/opportunity-details.js, or a status change from the
 * dropdown below).
 *
 * Split into two sections by workflow status (see js/plan-data.js's
 * STATUSES): Active Plan (Planned, In Progress) and Published (Published,
 * Tested). A status change re-groups a card into the right section on the
 * next render — nothing is ever deleted, so Published/Tested content stays
 * visible under Published.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var STATUS_CLASS = {
    Emerging: 'status-emerging',
    Rising: 'status-rising',
    Hot: 'status-hot'
  };

  // Workflow status (Planned / In Progress / Published / Tested) badge
  // classes — distinct from STATUS_CLASS above, which is the opportunity's
  // own Emerging/Rising/Hot trend label.
  var PLAN_STATUS_CLASS = {
    'Planned': 'plan-status-planned',
    'In Progress': 'plan-status-inprogress',
    'Published': 'plan-status-published',
    'Tested': 'plan-status-tested'
  };

  var els = {};

  // Which workflow statuses belong to each section. Published moves an item
  // out of Active Plan automatically — the grouping is recomputed on every
  // render() (itself triggered by DraftzennPlan's change event), so a status
  // change always re-sorts the card into the right section, never deletes it.
  var ACTIVE_STATUSES = ['Planned', 'In Progress'];
  var PUBLISHED_STATUSES = ['Published', 'Tested'];

  // Content History records for the signed-in creator, keyed by
  // sourceOpportunityId (see js/content-history-data.js's
  // upsertForOpportunity/getRecordForOpportunity). Refreshed whenever the
  // plan or history changes so a Published/Tested card can show "Results
  // recorded" without re-fetching on every render() call. Populated
  // best-effort — if auth/history isn't ready yet (or the creator has no
  // history), cards simply render without the results pill until the next
  // change event refreshes it.
  var historyByOpportunityId = {};

  document.addEventListener('DOMContentLoaded', function () {
    els.root = document.querySelector('[data-content-plan-root]');
    if (!els.root) return; // My Content Plan isn't on this page.

    els.count = els.root.querySelector('[data-plan-count]');
    els.empty = els.root.querySelector('[data-plan-empty]');

    els.activeSection = els.root.querySelector('[data-plan-active-section]');
    els.activeGrid = els.root.querySelector('[data-plan-active-grid]');
    els.activeCount = els.root.querySelector('[data-plan-active-count]');
    els.activeEmpty = els.root.querySelector('[data-plan-active-empty]');

    els.publishedSection = els.root.querySelector('[data-plan-published-section]');
    els.publishedGrid = els.root.querySelector('[data-plan-published-grid]');
    els.publishedCount = els.root.querySelector('[data-plan-published-count]');

    // Delegated on the section root (survives re-renders, since render()
    // only replaces each grid's innerHTML, not the root). Clicks/keydowns
    // on the status control must never reach the document-level
    // [data-opportunity-id] handler in js/opportunity-details.js —
    // otherwise interacting with the dropdown would also open the modal.
    els.root.addEventListener('click', function (evt) {
      if (evt.target.closest('[data-plan-status-select]')) evt.stopPropagation();

      // "Record Results" / "Edit Results" — stop this from also bubbling to
      // the Opportunity Details modal's document-level [data-opportunity-id]
      // handler (js/opportunity-details.js), which would otherwise treat
      // this click as "open the card" since the button sits inside a card
      // that carries that same attribute. Because stopping propagation here
      // means it never reaches a document-level listener, open the Record
      // Results modal directly via js/content-results.js's exposed API
      // instead of delegating through document like that other modal does.
      var resultsBtn = evt.target.closest('[data-record-results-btn]');
      if (resultsBtn) {
        evt.stopPropagation();
        var resultsId = resultsBtn.getAttribute('data-opportunity-id');
        if (resultsId && global.DraftzennResults) DraftzennResults.open(resultsId);
      }
    });
    els.root.addEventListener('keydown', function (evt) {
      if (evt.target.closest('[data-plan-status-select]')) evt.stopPropagation();
      if (evt.target.closest('[data-record-results-btn]')) evt.stopPropagation();
    });
    els.root.addEventListener('change', function (evt) {
      var select = evt.target.closest('[data-plan-status-select]');
      if (!select) return;
      evt.stopPropagation();
      var id = select.getAttribute('data-opportunity-id');
      if (id && global.DraftzennPlan) DraftzennPlan.setStatus(id, select.value);
    });

    refreshHistoryCache(render);

    if (global.DraftzennPlan) {
      DraftzennPlan.onChange(function () { refreshHistoryCache(render); });
    }
    if (global.DraftzennHistory) {
      // Fires right after "Record Results" saves (js/content-results.js) —
      // re-renders so the card's "Results recorded" pill appears without
      // requiring a reload.
      DraftzennHistory.onChange(function () { refreshHistoryCache(render); });
    }
  });

  /**
   * Re-fetches the current creator's Content History and rebuilds
   * historyByOpportunityId, then calls `then` (typically render()). Safe to
   * call before auth is ready — resolves to an empty map instead of
   * throwing, so a later change event just fills it in.
   */
  function refreshHistoryCache(then) {
    if (!global.DraftzennHistory) {
      historyByOpportunityId = {};
      if (then) then();
      return;
    }
    DraftzennHistory.getHistory()
      .then(function (records) {
        var map = {};
        (records || []).forEach(function (r) {
          if (r.sourceOpportunityId) map[r.sourceOpportunityId] = r;
        });
        historyByOpportunityId = map;
      })
      .catch(function () {
        historyByOpportunityId = {};
      })
      .then(function () {
        if (then) then();
      });
  }

  function render() {
    if (!els.root || !global.DraftzennPlan || !global.DraftzennRadarData) return;

    var planned = DraftzennPlan.getPlannedOpportunities(DraftzennRadarData.opportunities);

    if (els.count) {
      els.count.textContent = planned.length + ' planned';
    }

    if (!planned.length) {
      if (els.activeSection) els.activeSection.style.display = 'none';
      if (els.publishedSection) els.publishedSection.style.display = 'none';
      if (els.empty) els.empty.style.display = '';
      return;
    }

    if (els.empty) els.empty.style.display = 'none';

    var active = planned.filter(function (o) { return ACTIVE_STATUSES.indexOf(o.planStatus) !== -1; });
    var published = planned.filter(function (o) { return PUBLISHED_STATUSES.indexOf(o.planStatus) !== -1; });

    // Active Plan — always shown once something is planned, even if
    // everything currently in it has moved to Published/Tested.
    if (els.activeSection) els.activeSection.style.display = '';
    if (els.activeCount) els.activeCount.textContent = active.length + ' active';
    if (els.activeGrid) {
      if (active.length) {
        els.activeGrid.style.display = '';
        els.activeGrid.innerHTML = active.map(renderPlanCard).join('');
      } else {
        els.activeGrid.style.display = 'none';
        els.activeGrid.innerHTML = '';
      }
    }
    if (els.activeEmpty) els.activeEmpty.style.display = active.length ? 'none' : '';

    // Published — only shown once there's something in it; content never
    // gets deleted, it just accumulates here once Published or Tested.
    if (els.publishedSection) {
      if (published.length) {
        els.publishedSection.style.display = '';
        if (els.publishedCount) els.publishedCount.textContent = published.length + ' published';
        if (els.publishedGrid) els.publishedGrid.innerHTML = published.map(renderPlanCard).join('');
      } else {
        els.publishedSection.style.display = 'none';
        if (els.publishedGrid) els.publishedGrid.innerHTML = '';
      }
    }
  }

  function renderPlanCard(o) {
    var scoreClass = o.opportunityScore >= 80 ? 'score-high' : (o.opportunityScore >= 60 ? 'score-mid' : 'score-low');
    var statusClass = STATUS_CLASS[o.status] || 'status-emerging';

    var planStatus = o.planStatus || (global.DraftzennPlan ? DraftzennPlan.DEFAULT_STATUS : 'Planned');
    var planStatusClass = PLAN_STATUS_CLASS[planStatus] || 'plan-status-planned';
    var statuses = (global.DraftzennPlan && DraftzennPlan.STATUSES) || ['Planned', 'In Progress', 'Published', 'Tested'];

    return (
      '<article class="opportunity-card" data-opportunity-id="' + escapeAttr(o.id) + '" tabindex="0" role="button" ' +
        'aria-label="View details for ' + escapeAttr(o.topic) + '">' +
        '<div class="opportunity-top">' +
          '<div>' +
            '<p class="opportunity-platform">' + escapeHtml(o.platform) + ' \u00b7 ' + escapeHtml(o.niche) + '</p>' +
            '<h3>' + escapeHtml(o.topic) + '</h3>' +
          '</div>' +
          '<div class="opportunity-score ' + scoreClass + '" title="Opportunity score">' + escapeHtml(String(o.opportunityScore)) + '</div>' +
        '</div>' +

        '<div class="opportunity-tags">' +
          '<span class="tag status-pill ' + statusClass + '">' + escapeHtml(o.status) + '</span>' +
          '<span class="tag">Format: ' + escapeHtml(o.contentType) + '</span>' +
        '</div>' +

        '<div class="plan-status-row">' +
          '<span class="tag plan-status-badge ' + planStatusClass + '">' + escapeHtml(planStatus) + '</span>' +
          '<select class="plan-status-select" data-plan-status-select data-opportunity-id="' + escapeAttr(o.id) + '" ' +
            'aria-label="Update status for ' + escapeAttr(o.topic) + '">' +
            statuses.map(function (s) {
              return '<option value="' + escapeAttr(s) + '"' + (s === planStatus ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +

        '<div class="opportunity-detail">' +
          '<p class="opportunity-detail-label">Recommended next action</p>' +
          '<p>' + escapeHtml(o.suggestedAction) + '</p>' +
        '</div>' +

        '<p class="plan-card-meta">Added to plan ' + escapeHtml(formatDate(o.plannedAt)) + '</p>' +

        renderResultsRow(o, planStatus) +
      '</article>'
    );
  }

  /**
   * "Record Results" / "Edit Results" action + "Results recorded" pill —
   * only rendered for Published/Tested cards (PUBLISHED_STATUSES), per
   * Prompt 15: this action never appears for merely Planned/In Progress
   * content. Reads the cached Content History lookup built by
   * refreshHistoryCache(); js/content-results.js does the actual
   * modal/save work when the button is clicked.
   */
  function renderResultsRow(o, planStatus) {
    if (PUBLISHED_STATUSES.indexOf(planStatus) === -1) return '';

    var record = historyByOpportunityId[o.id];
    var hasResults = !!record && typeof record.views === 'number';

    var pill = hasResults
      ? '<span class="tag results-recorded-pill">Results recorded' +
        ' \u00b7 ' + escapeHtml(formatCompactNumber(record.views)) + ' views</span>'
      : '';

    var buttonLabel = record ? 'Edit Results' : 'Record Results';

    return (
      '<div class="plan-results-row">' +
        pill +
        '<button type="button" class="btn btn-ghost btn-sm" data-record-results-btn ' +
          'data-opportunity-id="' + escapeAttr(o.id) + '">' + escapeHtml(buttonLabel) + '</button>' +
      '</div>'
    );
  }

  function formatCompactNumber(n) {
    if (typeof n !== 'number' || isNaN(n)) return '';
    var abs = Math.abs(n);
    if (abs >= 1000000) return trimTrailingZero(n / 1000000) + 'M';
    if (abs >= 1000) return trimTrailingZero(n / 1000) + 'K';
    return String(n);
  }

  function trimTrailingZero(n) {
    var rounded = Math.round(n * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : String(rounded);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }
})(window);
