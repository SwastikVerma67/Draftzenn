/**
 * Draftzenn — Content History page
 * ---------------------------------------------------------------------------
 * Guards the page (requires a signed-in creator), loads their saved content
 * history (js/content-history-data.js), renders it newest-first as rows
 * with a simple relative performance label, and wires the "Add content"
 * form. Adding a record re-renders the list in place — no page reload.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var FIELD_LABELS = {
    topic: 'Content title / topic',
    views: 'Views',
    likes: 'Likes',
    comments: 'Comments',
    shares: 'Shares'
  };

  document.addEventListener('DOMContentLoaded', function () {
    var content = document.querySelector('[data-history-content]');
    var form = document.getElementById('history-form');
    if (!form) return;

    if (!window.DraftzennAuth || !window.DraftzennHistory) return;

    var banner = document.getElementById('history-form-banner');
    var submitBtn = document.getElementById('history-submit');
    var savedNote = document.querySelector('[data-history-saved-note]');
    var listEl = document.querySelector('[data-history-list]');
    var emptyEl = document.querySelector('[data-history-empty]');
    var countEl = document.querySelector('[data-history-count]');

    var fields = {
      topic: document.getElementById('field-topic'),
      platform: document.getElementById('field-platform'),
      format: document.getElementById('field-format'),
      publishDate: document.getElementById('field-publish-date'),
      views: document.getElementById('field-views'),
      likes: document.getElementById('field-likes'),
      comments: document.getElementById('field-comments'),
      shares: document.getElementById('field-shares')
    };

    DraftzennAuth.getCurrentUser()
      .then(function (user) {
        if (!user) {
          window.location.href = 'login.html';
          return undefined; // already redirecting
        }
        return DraftzennHistory.getHistory();
      })
      .then(function (records) {
        if (records === undefined) return; // already redirecting to login
        renderList(records);
        if (content) content.style.display = '';
      })
      .catch(function (err) {
        console.error('[Draftzenn][debug] content-history: failed to load saved data:', err);
        renderList([]);
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

      DraftzennHistory.addRecord(data)
        .then(function (records) {
          DraftzennForm.setLoading(submitBtn, false);
          DraftzennForm.showBanner(banner, 'Added to your content history.', 'success');
          if (savedNote) savedNote.textContent = 'Last added just now.';
          form.reset();
          renderList(records);
        })
        .catch(function (err) {
          DraftzennForm.setLoading(submitBtn, false);
          DraftzennForm.showBanner(banner, err.message || 'Something went wrong. Please try again.');
        });
    });

    // ---- helpers ------------------------------------------------------

    function readForm() {
      return {
        topic: document.getElementById('history-topic').value,
        platform: document.getElementById('history-platform').value,
        format: document.getElementById('history-format').value,
        publishDate: document.getElementById('history-publish-date').value,
        views: document.getElementById('history-views').value,
        likes: document.getElementById('history-likes').value,
        comments: document.getElementById('history-comments').value,
        shares: document.getElementById('history-shares').value
      };
    }

    function validate(data) {
      var errors = {};

      if (!data.topic.trim()) {
        errors.topic = 'Enter a title or topic for this content.';
      }

      ['views', 'likes', 'comments', 'shares'].forEach(function (key) {
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

    function renderList(records) {
      records = records || [];

      if (countEl) {
        countEl.textContent = records.length + (records.length === 1 ? ' entry' : ' entries');
      }

      if (!records.length) {
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = '';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      if (!listEl) return;

      listEl.innerHTML = '';
      records.forEach(function (record) {
        listEl.appendChild(buildRow(record, records));
      });
    }

    function buildRow(record, allRecords) {
      var row = document.createElement('div');
      row.className = 'history-row';
      row.setAttribute('data-history-id', record.id);

      var main = document.createElement('div');
      main.className = 'history-row-main';

      var topic = document.createElement('div');
      topic.className = 'history-row-topic';
      topic.textContent = record.topic || 'Untitled content';
      main.appendChild(topic);

      var meta = document.createElement('div');
      meta.className = 'history-row-meta';

      if (record.platform) {
        var platformTag = document.createElement('span');
        platformTag.className = 'tag';
        platformTag.textContent = record.platform;
        meta.appendChild(platformTag);
      }

      if (record.format) {
        var formatTag = document.createElement('span');
        formatTag.className = 'tag';
        formatTag.textContent = record.format;
        meta.appendChild(formatTag);
      }

      if (record.sourceOpportunityId) {
        var sourceTag = document.createElement('span');
        sourceTag.className = 'tag';
        sourceTag.textContent = 'From Content Plan';
        meta.appendChild(sourceTag);
      }

      if (record.imported) {
        var importedTag = document.createElement('span');
        importedTag.className = 'tag tag-imported';
        importedTag.textContent = 'Imported from ' + (record.platform || 'platform');
        meta.appendChild(importedTag);
      }

      var dateSpan = document.createElement('span');
      dateSpan.className = 'history-row-date';
      dateSpan.textContent = formatDate(record.publishDate);
      meta.appendChild(dateSpan);

      main.appendChild(meta);
      row.appendChild(main);

      var stats = document.createElement('div');
      stats.className = 'history-row-stats';
      stats.appendChild(buildStat('Views', record.views));
      stats.appendChild(buildStat('Likes', record.likes));
      stats.appendChild(buildStat('Comments', record.comments));
      stats.appendChild(buildStat('Shares', record.shares));
      row.appendChild(stats);

      var side = document.createElement('div');
      side.className = 'history-row-side';

      var label = DraftzennHistory.getPerformanceLabel(record, allRecords);
      var labelPill = document.createElement('span');
      labelPill.className = 'tag history-label ' + labelClass(label);
      labelPill.textContent = label || 'Not enough data yet';
      side.appendChild(labelPill);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'history-row-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', function () {
        DraftzennHistory.removeRecord(record.id).then(renderList);
      });
      side.appendChild(removeBtn);

      row.appendChild(side);

      return row;
    }

    function buildStat(label, value) {
      var wrap = document.createElement('div');
      wrap.className = 'history-stat';

      var val = document.createElement('div');
      val.className = 'value';
      val.textContent = formatNumber(value);
      wrap.appendChild(val);

      var lab = document.createElement('div');
      lab.className = 'label';
      lab.textContent = label;
      wrap.appendChild(lab);

      return wrap;
    }

    function labelClass(label) {
      if (label === 'Strong') return 'label-strong';
      if (label === 'Low') return 'label-low';
      if (label === 'Average') return 'label-average';
      return 'label-unrated';
    }

    function formatNumber(n) {
      if (typeof n !== 'number') return '—';
      try {
        return n.toLocaleString();
      } catch (e) {
        return String(n);
      }
    }

    function formatDate(dateStr) {
      if (!dateStr) return 'No date entered';
      var d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return 'No date entered';
      try {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {
        return dateStr;
      }
    }
  });
})();
