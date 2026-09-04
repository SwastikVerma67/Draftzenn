/**
 * Draftzenn — Creator Performance page
 * ---------------------------------------------------------------------------
 * Guards the page (requires a signed-in creator), loads any previously
 * saved performance data for them (js/performance-data.js), pre-fills the
 * form if it exists, and renders the summary. Saving re-renders the summary
 * in place — no page reload needed.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var NUMERIC_FIELD_IDS = {
    avgViews: 'avg-views',
    avgLikes: 'avg-likes',
    avgComments: 'avg-comments',
    avgShares: 'avg-shares',
    postsPerWeek: 'posts-per-week'
  };

  var FIELD_LABELS = {
    avgViews: 'Average views',
    avgLikes: 'Average likes',
    avgComments: 'Average comments',
    avgShares: 'Average shares',
    postsPerWeek: 'Posts per week'
  };

  document.addEventListener('DOMContentLoaded', function () {
    var content = document.querySelector('[data-performance-content]');
    var form = document.getElementById('performance-form');
    if (!form) return;

    if (!window.DraftzennAuth || !window.DraftzennPerformance) return;

    var banner = document.getElementById('form-banner');
    var submitBtn = document.getElementById('performance-submit');
    var savedNote = document.querySelector('[data-performance-saved-note]');
    var updatedSub = document.querySelector('[data-performance-updated]');

    var fields = {
      avgViews: document.getElementById('field-avg-views'),
      avgLikes: document.getElementById('field-avg-likes'),
      avgComments: document.getElementById('field-avg-comments'),
      avgShares: document.getElementById('field-avg-shares'),
      postsPerWeek: document.getElementById('field-posts-per-week'),
      bestFormat: document.getElementById('field-best-format'),
      bestTopic: document.getElementById('field-best-topic')
    };

    DraftzennAuth.getCurrentUser()
      .then(function (user) {
        if (!user) {
          window.location.href = 'login.html';
          return undefined; // already redirecting
        }
        return DraftzennPerformance.getPerformance();
      })
      .then(function (record) {
        if (record === undefined) return; // already redirecting to login
        if (record) {
          prefill(record);
          renderSummary(record);
        }
        if (content) content.style.display = '';
      })
      .catch(function (err) {
        console.error('[Draftzenn][debug] performance: failed to load saved data:', err);
        // Not signed-in errors are handled above; anything else just means
        // the form opens empty — still fully usable.
        if (content) content.style.display = '';
      });

    // Clear a field's error state as soon as the creator edits it.
    Object.keys(fields).forEach(function (key) {
      var fieldEl = fields[key];
      if (!fieldEl) return;
      var input = fieldEl.querySelector('input, select');
      if (!input) return;
      input.addEventListener('input', function () {
        DraftzennForm.clearFieldError(fieldEl);
        DraftzennForm.hideBanner(banner);
      });
      input.addEventListener('change', function () {
        DraftzennForm.clearFieldError(fieldEl);
        DraftzennForm.hideBanner(banner);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      DraftzennForm.hideBanner(banner);

      var data = readForm();
      var errors = validate(data);

      Object.keys(fields).forEach(function (key) {
        if (fields[key]) toggleFieldError(fields[key], errors[key]);
      });

      if (Object.keys(errors).length) {
        var firstInvalid = form.querySelector('.has-error');
        if (firstInvalid) {
          var firstInput = firstInvalid.querySelector('input, select');
          if (firstInput) firstInput.focus();
        }
        return;
      }

      DraftzennForm.setLoading(submitBtn, true);

      DraftzennPerformance.savePerformance(data)
        .then(function (record) {
          DraftzennForm.setLoading(submitBtn, false);
          DraftzennForm.showBanner(banner, 'Performance data saved.', 'success');
          renderSummary(record);
        })
        .catch(function (err) {
          DraftzennForm.setLoading(submitBtn, false);
          DraftzennForm.showBanner(banner, err.message || 'Something went wrong. Please try again.');
        });
    });

    // ---- helpers ------------------------------------------------------

    function readForm() {
      var data = {};
      Object.keys(NUMERIC_FIELD_IDS).forEach(function (key) {
        var input = document.getElementById(NUMERIC_FIELD_IDS[key]);
        data[key] = input ? input.value : '';
      });
      data.bestFormat = document.getElementById('best-format').value;
      data.bestTopic = document.getElementById('best-topic').value;
      return data;
    }

    function prefill(record) {
      Object.keys(NUMERIC_FIELD_IDS).forEach(function (key) {
        var input = document.getElementById(NUMERIC_FIELD_IDS[key]);
        if (input && typeof record[key] === 'number') input.value = record[key];
      });
      var formatSelect = document.getElementById('best-format');
      if (formatSelect) formatSelect.value = record.bestFormat || '';
      var topicInput = document.getElementById('best-topic');
      if (topicInput) topicInput.value = record.bestTopic || '';

      if (savedNote) savedNote.textContent = 'Last saved ' + formatDate(record.updatedAt) + '.';
      if (updatedSub) updatedSub.textContent = 'Last updated ' + formatDate(record.updatedAt);
    }

    function validate(data) {
      var errors = {};
      Object.keys(NUMERIC_FIELD_IDS).forEach(function (key) {
        var raw = data[key];
        if (raw === '' || raw === null || raw === undefined) return; // optional
        var n = Number(raw);
        if (isNaN(n)) {
          errors[key] = 'Enter a number for ' + FIELD_LABELS[key].toLowerCase() + '.';
        } else if (n < 0) {
          errors[key] = FIELD_LABELS[key] + ' can\u2019t be negative.';
        }
      });
      return errors;
    }

    function toggleFieldError(fieldEl, message) {
      if (message) {
        DraftzennForm.setFieldError(fieldEl, message);
      } else {
        DraftzennForm.clearFieldError(fieldEl);
      }
    }

    function renderSummary(record) {
      var summary = document.querySelector('[data-performance-summary]');
      var emptyHint = document.querySelector('[data-performance-empty-hint]');
      if (!summary) return;

      var hasAnything = [record.avgViews, record.avgLikes, record.avgComments, record.avgShares, record.postsPerWeek]
        .some(function (n) { return typeof n === 'number'; }) || record.bestTopic || record.bestFormat;

      if (!hasAnything) {
        summary.style.display = 'none';
        if (emptyHint) emptyHint.style.display = '';
        return;
      }

      if (emptyHint) emptyHint.style.display = 'none';
      summary.style.display = '';

      setText('[data-summary-avg-views]', formatNumber(record.avgViews));
      setText('[data-summary-avg-likes]', formatNumber(record.avgLikes));
      setText('[data-summary-avg-comments]', formatNumber(record.avgComments));
      setText('[data-summary-avg-shares]', formatNumber(record.avgShares));
      setText('[data-summary-frequency]', formatFrequency(record.postsPerWeek));
      setText('[data-summary-topic]', record.bestTopic || 'Not entered yet');
      setText('[data-summary-format]', record.bestFormat || 'Not entered yet');

      var hasEngagementInputs = [record.avgLikes, record.avgComments, record.avgShares]
        .some(function (n) { return typeof n === 'number'; });

      var engagementTotal = [record.avgLikes, record.avgComments, record.avgShares]
        .filter(function (n) { return typeof n === 'number'; })
        .reduce(function (sum, n) { return sum + n; }, 0);

      if (typeof record.avgViews === 'number' && record.avgViews > 0 && hasEngagementInputs) {
        var rate = (engagementTotal / record.avgViews) * 100;
        setText('[data-summary-engagement-rate]', rate.toFixed(1) + '%');
        setText('[data-summary-engagement-detail]', 'Likes + comments + shares \u00f7 average views');
      } else {
        setText('[data-summary-engagement-rate]', 'Not enough data');
        setText('[data-summary-engagement-detail]', 'Add average views and likes/comments/shares to calculate this');
      }

      if (savedNote) savedNote.textContent = 'Last saved ' + formatDate(record.updatedAt) + '.';
      if (updatedSub) updatedSub.textContent = 'Last updated ' + formatDate(record.updatedAt);
    }

    function setText(selector, text) {
      var el = document.querySelector(selector);
      if (el) el.textContent = text;
    }

    function formatNumber(n) {
      if (typeof n !== 'number') return 'Not entered yet';
      try {
        return n.toLocaleString();
      } catch (e) {
        return String(n);
      }
    }

    function formatFrequency(n) {
      if (typeof n !== 'number') return 'Not entered yet';
      var unit = n === 1 ? 'post' : 'posts';
      return n + ' ' + unit + ' / week';
    }

    function formatDate(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'just now';
      try {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {
        return 'just now';
      }
    }
  });
})();
