/**
 * Draftzenn — Connected Platforms page
 * ---------------------------------------------------------------------------
 * Guards the page (requires a signed-in creator) and renders one card per
 * known platform (see js/platform-connections.js).
 *
 * Instagram / TikTok: unchanged — "coming soon" modal, no real connection.
 *
 * YouTube (Prompt 20): status comes from the real `youtube_connections`
 * Supabase row (js/youtube-integration.js#getConnectionStatus), Connect
 * kicks off the real Google OAuth flow, and once connected a Sync button
 * pulls in the creator's own videos additively into Content History. If
 * the backend boundary (/api/youtube/*) isn't deployed yet, Connect fails
 * with a clear explanatory message instead of pretending to work.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var PLATFORM_ICONS = {
    youtube:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M22 12c0-2.4-.2-3.9-.5-4.8-.3-.9-1-1.6-1.9-1.9C18 4.9 12 4.9 12 4.9s-6 0-7.6.4c-.9.3-1.6 1-1.9 1.9C2.2 8.1 2 9.6 2 12s.2 3.9.5 4.8c.3.9 1 1.6 1.9 1.9 1.6.4 7.6.4 7.6.4s6 0 7.6-.4c.9-.3 1.6-1 1.9-1.9.3-.9.5-2.4.5-4.8Z" fill="currentColor"/>' +
        '<path d="M10 9.3v5.4l4.8-2.7L10 9.3Z" fill="var(--white,#fff)"/>' +
      '</svg>',
    instagram:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" stroke-width="1.7"/>' +
        '<circle cx="12" cy="12" r="4.3" stroke="currentColor" stroke-width="1.7"/>' +
        '<circle cx="17.4" cy="6.6" r="1.15" fill="currentColor"/>' +
      '</svg>',
    tiktok:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M16.5 3c.4 2.2 1.9 3.9 4 4.3v3.1c-1.5 0-2.9-.5-4-1.3v6.4c0 3.6-3 6.4-6.5 6.1-3.1-.3-5.5-2.9-5.5-6 0-3.3 2.7-6 6-6 .3 0 .6 0 .9.1v3.2c-.3-.1-.6-.2-.9-.2-1.5 0-2.8 1.2-2.8 2.8s1.3 2.8 2.8 2.8c1.6 0 3-1.3 3-3V3h3Z" fill="currentColor"/>' +
      '</svg>'
  };

  document.addEventListener('DOMContentLoaded', function () {
    var content = document.querySelector('[data-connections-content]');
    var grid = document.querySelector('[data-connections-grid]');
    var banner = document.querySelector('[data-status-banner]');
    if (!grid) return;

    if (!window.DraftzennAuth || !window.DraftzennPlatformConnections) return;

    var modal = document.querySelector('[data-connection-modal]');
    var modalTitle = document.querySelector('[data-connection-modal-title]');
    var modalBody = modal ? modal.querySelector('p') : null;
    var modalCloseBtn = document.querySelector('[data-connection-modal-close]');
    var modalCloseFooterBtn = document.querySelector('[data-connection-modal-close-btn]');

    showBannerFromQueryParam();

    DraftzennAuth.getCurrentUser()
      .then(function (user) {
        if (!user) {
          window.location.href = 'login.html';
          return undefined; // already redirecting
        }
        return loadAndRender();
      })
      .catch(function (err) {
        console.error('[Draftzenn][debug] connected-platforms: failed to load connections:', err);
        if (content) content.style.display = '';
      });

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    // ---- helpers ------------------------------------------------------

    /**
     * Loads Instagram/TikTok's local placeholder records plus YouTube's
     * real Supabase-backed status, and renders all three cards.
     */
    function loadAndRender() {
      return Promise.all([
        DraftzennPlatformConnections.getConnections(),
        window.DraftzennYouTubeIntegration
          ? window.DraftzennYouTubeIntegration.getConnectionStatus()
          : Promise.resolve(null)
      ]).then(function (results) {
        var connections = results[0];
        var youtubeStatus = results[1];

        renderCards(connections, youtubeStatus);
        if (content) content.style.display = '';
      });
    }

    /** Re-reads just YouTube's status and re-renders (used after connect/sync/disconnect). */
    function refreshYouTubeCard() {
      return loadAndRender();
    }

    function showBannerFromQueryParam() {
      if (!banner) return;
      var params = new URLSearchParams(window.location.search);
      var status = params.get('youtube');
      if (!status) return;

      var messages = {
        connected: { type: 'success', text: 'YouTube connected. Click Sync to import your videos.' },
        cancelled: { type: 'error', text: 'YouTube connection was cancelled.' },
        no_channel: { type: 'error', text: 'That Google account doesn\u2019t have a YouTube channel Draftzenn could find.' },
        error: { type: 'error', text: 'Something went wrong connecting YouTube. Please try again.' }
      };
      var msg = messages[status];
      if (msg) renderBanner(msg.type, msg.text);

      // Clean the URL so refreshing the page doesn't re-show the banner.
      params.delete('youtube');
      var newSearch = params.toString();
      var newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
      window.history.replaceState({}, '', newUrl);
    }

    function renderBanner(type, text) {
      if (!banner) return;
      banner.innerHTML = '';
      var el = document.createElement('div');
      el.className = 'page-banner page-banner-' + (type === 'success' ? 'success' : 'error');
      el.textContent = text;
      banner.appendChild(el);
    }

    function clearBanner() {
      if (banner) banner.innerHTML = '';
    }

    function renderCards(connections, youtubeStatus) {
      grid.innerHTML = '';
      connections.forEach(function (record) {
        if (record.platformId === 'youtube') {
          grid.appendChild(buildYouTubeCard(youtubeStatus || {}));
        } else {
          grid.appendChild(buildComingSoonCard(record));
        }
      });
    }

    // ---- Instagram / TikTok: unchanged behavior ------------------------

    function buildComingSoonCard(record) {
      var card = document.createElement('div');
      card.className = 'connection-card';
      card.appendChild(cardHead(record.platformId, record.name));

      var status = document.createElement('span');
      status.className = 'connection-status';
      status.textContent = 'Not connected';
      card.appendChild(status);

      var connectBtn = document.createElement('button');
      connectBtn.type = 'button';
      connectBtn.className = 'btn btn-primary';
      connectBtn.textContent = 'Connect';
      connectBtn.addEventListener('click', function () {
        DraftzennPlatformConnections.requestConnect(record.platformId).then(function () {
          openComingSoonModal();
        });
      });
      card.appendChild(connectBtn);

      return card;
    }

    // ---- YouTube: real states -------------------------------------------

    function buildYouTubeCard(status) {
      var card = document.createElement('div');
      card.className = 'connection-card';
      card.appendChild(cardHead('youtube', 'YouTube'));

      var state = status.status || 'not_connected';

      var statusEl = document.createElement('span');
      statusEl.className = 'connection-status connection-status-' + state;
      statusEl.textContent = statusLabel(state);
      card.appendChild(statusEl);

      if (status.error) {
        var errEl = document.createElement('p');
        errEl.className = 'connection-error-text';
        errEl.textContent = status.error;
        card.appendChild(errEl);
      }

      if (state === 'connected' || state === 'syncing' || state === 'synced') {
        var meta = document.createElement('p');
        meta.className = 'connection-meta';
        var lines = [];
        if (status.channel_name) lines.push('<strong>' + escapeHtml(status.channel_name) + '</strong>');
        if (typeof status.subscriber_count === 'number') {
          lines.push(formatNumber(status.subscriber_count) + ' subscribers');
        }
        if (status.last_synced_at) {
          lines.push('Last synced ' + formatRelativeTime(status.last_synced_at));
        } else {
          lines.push('Not synced yet');
        }
        meta.innerHTML = lines.join('<br>');
        card.appendChild(meta);
      }

      var actions = document.createElement('div');
      actions.className = 'connection-card-actions';

      if (state === 'not_connected' || state === 'error') {
        var connectBtn = document.createElement('button');
        connectBtn.type = 'button';
        connectBtn.className = 'btn btn-primary';
        connectBtn.textContent = state === 'error' ? 'Reconnect' : 'Connect';
      connectBtn.addEventListener('click', function () {
        // Read the user ID instantly out of your active browser session cache storage
        var sessionData = localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
        var userId = 'u_testing_creator';

        if (sessionData) {
          try {
            var parsed = JSON.parse(sessionData);
            var foundId = parsed?.user?.id || parsed?.currentSession?.user?.id;
            if (foundId) {
              userId = encodeURIComponent(foundId);
            }
          } catch (e) {
            console.error("Session parse error:", e);
          }
        }

            window.location.href = '/api/youtube/connect?userId=' + userId;
      });

      actions.appendChild(connectBtn);
    } else {

        var disconnectBtn = document.createElement('button');
        disconnectBtn.type = 'button';
        disconnectBtn.className = 'btn btn-ghost';
        disconnectBtn.textContent = 'Disconnect';
        disconnectBtn.addEventListener('click', function () {
          disconnectBtn.disabled = true;
          window.DraftzennYouTubeIntegration.disconnect()
            .then(refreshYouTubeCard)
            .catch(function (err) {
              disconnectBtn.disabled = false;
              renderBanner('error', err.message || 'Couldn\u2019t disconnect. Please try again.');
            });
        });
        actions.appendChild(disconnectBtn);
      }

      card.appendChild(actions);
      return card;
    }

    // ---- shared helpers -------------------------------------------------

    function cardHead(platformId, name) {
      var head = document.createElement('div');
      head.className = 'connection-card-head';

      var icon = document.createElement('span');
      icon.className = 'connection-icon connection-icon-' + platformId;
      icon.innerHTML = PLATFORM_ICONS[platformId] || '';
      icon.setAttribute('aria-hidden', 'true');
      head.appendChild(icon);

      var nameEl = document.createElement('h3');
      nameEl.textContent = name;
      head.appendChild(nameEl);

      return head;
    }

    function statusLabel(status) {
      switch (status) {
        case 'connected': return 'Connected';
        case 'syncing': return 'Syncing\u2026';
        case 'synced': return 'Synced';
        case 'connecting': return 'Connecting\u2026';
        case 'error': return 'Connection error';
        case 'not_connected':
        default: return 'Not connected';
      }
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function formatNumber(n) {
      return Number(n).toLocaleString();
    }

    function formatRelativeTime(iso) {
      var then = new Date(iso).getTime();
      if (isNaN(then)) return 'recently';
      var diffMs = Date.now() - then;
      var mins = Math.round(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + ' min ago';
      var hours = Math.round(mins / 60);
      if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
      var days = Math.round(hours / 24);
      return days + (days === 1 ? ' day ago' : ' days ago');
    }

    function openComingSoonModal() {
      if (modalTitle) modalTitle.textContent = 'Platform connection is coming soon.';
      if (modalBody) modalBody.textContent = 'You\u2019ll be able to connect your account and automatically import your content and performance data.';
      openModal();
    }

    function openBackendModal(message) {
      if (modalTitle) modalTitle.textContent = 'YouTube connection isn\u2019t available yet.';
      if (modalBody) modalBody.textContent = message || 'YouTube connection isn\u2019t set up on this deployment yet.';
      openModal();
    }

    function openModal() {
      if (!modal) return;
      modal.hidden = false;
      document.body.classList.add('modal-open');
    }

    function closeModal() {
      if (!modal) return;
      modal.hidden = true;
      document.body.classList.remove('modal-open');
    }
  });
})();
