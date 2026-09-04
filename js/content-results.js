/**
 * Draftzenn — Record Results
 * ---------------------------------------------------------------------------
 * The "Record Results" modal opened from a Published/Tested card in My
 * Content Plan (js/content-plan.js). Lets a creator log Views/Likes/
 * Comments/Shares/Publish date for content they've already published or
 * tested, without re-typing the title/topic/platform/format Draftzenn
 * already knows from the planned opportunity (js/radar-data.js).
 *
 * Saving writes through DraftzennHistory.upsertForOpportunity()
 * (js/content-history-data.js), which creates one Content History record
 * per opportunity id and updates that same record on every later save —
 * so editing a result never creates a duplicate history row. That, in
 * turn, is exactly what js/creator-learning.js already reads (any history
 * record with a real `views` number counts), so a newly recorded result
 * feeds Creator Learning — and therefore Prompt 12's personalized scoring
 * and Prompt 13's "Why this recommended to you?" — the next time Creator
 * Radar re-renders, with no changes needed in either of those files.
 *
 * Opened programmatically via the small public API below (DraftzennResults
 * .open(id)) rather than through document-level click delegation like
 * js/opportunity-details.js uses — see js/content-plan.js's click handler
 * for why: the button lives inside a card that already carries
 * [data-opportunity-id] for that other modal, so the click is stopped from
 * bubbling to avoid opening both, and this modal is invoked directly
 * instead.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var els = {};
  var currentOpportunity = null;
  var lastFocusedEl = null;

  // Opportunity contentType vocab (js/radar-data.js: 'Shorts/Reels' |
  // 'Long-form' | 'Both' | 'Other') -> Content History format vocab
  // (js/content-history-data.js FORMATS) — keeps a result recorded here
  // grouped consistently with formats logged by hand on the Content
  // History page, so js/creator-learning.js's strongestFormat signal (and
  // weak-pattern combos) see one vocabulary either way.
  var CONTENT_TYPE_TO_FORMAT = {
    'Shorts/Reels': 'Short / Reel',
    'Long-form': 'Long-form video',
    'Both': 'Other',
    'Other': 'Other'
  };

  var NUMERIC_LABELS = { views: 'Views', likes: 'Likes', comments: 'Comments', shares: 'Shares' };

  document.addEventListener('DOMContentLoaded', function () {
    els.overlay = document.querySelector('[data-results-modal]');
    if (!els.overlay) return; // Modal isn't on this page.

    els.dialog = els.overlay.querySelector('[data-results-modal-dialog]');
    els.platform = els.overlay.querySelector('[data-results-modal-platform]');
    els.topic = els.overlay.querySelector('[data-results-modal-topic]');
    els.tags = els.overlay.querySelector('[data-results-modal-tags]');
    els.form = document.getElementById('results-form');
    els.banner = document.getElementById('results-form-banner');
    els.submitBtn = document.getElementById('results-submit');
    els.closeBtn = els.overlay.querySelector('[data-results-modal-close]');
    els.closeBtn2 = els.overlay.querySelector('[data-results-modal-close-btn]');

    els.fields = {
      publishDate: document.getElementById('field-results-publish-date'),
      views: document.getElementById('field-results-views'),
      likes: document.getElementById('field-results-likes'),
      comments: document.getElementById('field-results-comments'),
      shares: document.getElementById('field-results-shares')
    };

    if (!els.form) return;

    els.overlay.addEventListener('click', function (evt) {
      if (evt.target === els.overlay) closeModal();
    });

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && els.overlay && !els.overlay.hidden) closeModal();
    });

    if (els.closeBtn) els.closeBtn.addEventListener('click', closeModal);
    if (els.closeBtn2) els.closeBtn2.addEventListener('click', closeModal);

    Object.keys(els.fields).forEach(function (key) {
      var fieldEl = els.fields[key];
      if (!fieldEl) return;
      var input = fieldEl.querySelector('input');
      if (!input) return;
      input.addEventListener('input', function () {
        if (!global.DraftzennForm) return;
        DraftzennForm.clearFieldError(fieldEl);
        DraftzennForm.hideBanner(els.banner);
      });
    });

    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSubmit();
    });
  });

  function findOpportunity(id) {
    if (global.DraftzennRadar && global.DraftzennRadar.findScored) {
      var scored = global.DraftzennRadar.findScored(id);
      if (scored) return scored;
    }
    var data = global.DraftzennRadarData;
    if (!data) return null;
    var found = null;
    data.opportunities.some(function (o) {
      if (o.id === id) { found = o; return true; }
      return false;
    });
    return found;
  }

  /**
   * Opens the modal for a given opportunity id — the public entry point
   * called by js/content-plan.js when "Record Results" / "Edit Results" is
   * clicked. No-ops if the modal isn't on this page or the id can't be
   * resolved to a known opportunity.
   */
  function openModal(id) {
    var o = findOpportunity(id);
    if (!o || !els.overlay) return;
    currentOpportunity = o;

    if (els.platform) els.platform.textContent = o.platform + ' \u00b7 ' + o.niche;
    if (els.topic) els.topic.textContent = o.topic;
    if (els.tags) {
      els.tags.innerHTML =
        '<span class="tag">Format: ' + escapeHtml(o.contentType) + '</span>' +
        '<span class="tag">' + escapeHtml(o.platform) + '</span>';
    }

    resetForm();

    lastFocusedEl = document.activeElement;
    els.overlay.hidden = false;
    document.body.classList.add('modal-open');

    // Prefill from any result already logged for this opportunity — so
    // re-opening "Edit Results" shows what was entered last time instead
    // of a blank form (js/content-history-data.js keys this lookup by
    // sourceOpportunityId, same id used to save).
    if (global.DraftzennHistory) {
      DraftzennHistory.getRecordForOpportunity(o.id)
        .then(function (record) {
          // Only apply if the modal is still open for this same opportunity
          // (guards against a fast close/reopen of a different card).
          if (record && currentOpportunity && currentOpportunity.id === o.id) prefillForm(record);
        })
        .catch(function () { /* not signed in yet / no existing record — leave form blank */ });
    }

    var firstInput = els.fields.publishDate && els.fields.publishDate.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  function closeModal() {
    if (!els.overlay || els.overlay.hidden) return;
    els.overlay.hidden = true;
    document.body.classList.remove('modal-open');
    currentOpportunity = null;
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
  }

  function resetForm() {
    if (els.form) els.form.reset();
    if (global.DraftzennForm) {
      DraftzennForm.hideBanner(els.banner);
      Object.keys(els.fields).forEach(function (key) {
        if (els.fields[key]) DraftzennForm.clearFieldError(els.fields[key]);
      });
    }
  }

  function prefillForm(record) {
    setValue('results-publish-date', record.publishDate);
    setValue('results-views', record.views);
    setValue('results-likes', record.likes);
    setValue('results-comments', record.comments);
    setValue('results-shares', record.shares);
  }

  function setValue(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = (value === null || value === undefined) ? '' : value;
  }

  function valueOf(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function readForm() {
    return {
      publishDate: valueOf('results-publish-date'),
      views: valueOf('results-views'),
      likes: valueOf('results-likes'),
      comments: valueOf('results-comments'),
      shares: valueOf('results-shares')
    };
  }

  /**
   * Every metric field is optional — a creator may only have partial
   * numbers at hand. Whatever is left blank is saved as null (see
   * js/content-history-data.js's toNumberOrNull) rather than guessed at;
   * only real numbers are validated here.
   */
  function validate(data) {
    var errors = {};
    ['views', 'likes', 'comments', 'shares'].forEach(function (key) {
      var raw = data[key];
      if (raw === '' || raw === null || raw === undefined) return;
      var n = Number(raw);
      if (isNaN(n)) {
        errors[key] = 'Enter a number for ' + NUMERIC_LABELS[key].toLowerCase() + '.';
      } else if (n < 0) {
        errors[key] = NUMERIC_LABELS[key] + ' can\u2019t be negative.';
      }
    });
    return errors;
  }

  function handleSubmit() {
    if (!currentOpportunity || !global.DraftzennHistory) return;

    if (global.DraftzennForm) DraftzennForm.hideBanner(els.banner);

    var data = readForm();
    var errors = validate(data);

    Object.keys(els.fields).forEach(function (key) {
      var fieldEl = els.fields[key];
      if (!fieldEl || !global.DraftzennForm) return;
      if (errors[key]) {
        DraftzennForm.setFieldError(fieldEl, errors[key]);
      } else {
        DraftzennForm.clearFieldError(fieldEl);
      }
    });

    if (Object.keys(errors).length) {
      var firstInvalid = els.form.querySelector('.has-error');
      var firstInput = firstInvalid && firstInvalid.querySelector('input');
      if (firstInput) firstInput.focus();
      return;
    }

    if (global.DraftzennForm) DraftzennForm.setLoading(els.submitBtn, true);

    var opportunityId = currentOpportunity.id;
    var payload = {
      // Reused automatically from the planned opportunity — never
      // re-entered by the creator (Prompt 15 requirement #2).
      topic: currentOpportunity.topic,
      platform: currentOpportunity.platform,
      format: CONTENT_TYPE_TO_FORMAT[currentOpportunity.contentType] || 'Other',
      publishDate: data.publishDate,
      views: data.views,
      likes: data.likes,
      comments: data.comments,
      shares: data.shares
    };

    DraftzennHistory.upsertForOpportunity(opportunityId, payload)
      .then(function () {
        if (global.DraftzennForm) {
          DraftzennForm.setLoading(els.submitBtn, false);
          DraftzennForm.showBanner(
            els.banner,
            'Results recorded \u2014 Draftzenn can now learn from this result.',
            'success'
          );
        }
        // A short pause so the confirmation is actually seen, then close —
        // the card's "Results recorded" pill (js/content-plan.js, refreshed
        // via DraftzennHistory's change event) is the lasting confirmation
        // once the modal closes. Guarded so a fast reopen onto a different
        // opportunity doesn't get closed out from under the creator.
        global.setTimeout(function () {
          if (currentOpportunity && currentOpportunity.id === opportunityId) closeModal();
        }, 1400);
      })
      .catch(function (err) {
        if (global.DraftzennForm) {
          DraftzennForm.setLoading(els.submitBtn, false);
          DraftzennForm.showBanner(els.banner, (err && err.message) || 'Something went wrong. Please try again.');
        }
      });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.DraftzennResults = {
    open: openModal
  };
})(window);
