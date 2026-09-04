/**
 * Draftzenn — Nav behavior
 * ---------------------------------------------------------------------------
 * Handles three things on every page that includes it:
 *   1. Mobile nav toggle (hamburger open/close).
 *   2. Reflecting auth state in the nav — shows Sign Up / Login when signed
 *      out, or the user's name + Logout when signed in.
 *   3. Logo destination — signed-in creators clicking the Draftzenn logo
 *      land on dashboard.html; signed-out visitors keep the default
 *      index.html link already in the markup.
 *
 * Relies only on the DraftzennAuth interface (see auth-provider.js — live
 * wired to Supabase via supabase-auth-provider.js), so it keeps working
 * unchanged once the backend changes, and there's a single
 * getCurrentUser() call driving all three behaviors above.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initMobileToggle();
    syncNavToAuthState();
  });

  function initMobileToggle() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var links = document.querySelector('[data-nav-links]');
    if (!toggle || !links) return;

    toggle.addEventListener('click', function () {
      var isOpen = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  function syncNavToAuthState() {
    if (!window.DraftzennAuth) return;

    var brandLink = document.querySelector('.site-nav .brand');
    var signedOutEls = document.querySelectorAll('[data-auth-signed-out]');
    var signedInEls = document.querySelectorAll('[data-auth-signed-in]');
    var nameEls = document.querySelectorAll('[data-auth-name]');
    var logoutBtns = document.querySelectorAll('[data-auth-logout]');

    if (!signedOutEls.length && !signedInEls.length && !brandLink) return;

    DraftzennAuth.getCurrentUser().then(function (user) {
      toggle(!!user);
      if (user) {
        nameEls.forEach(function (el) {
          el.textContent = user.name || user.email;
        });
      }

      // Logo destination: signed-in creators should land back on their
      // dashboard, not the public landing page. Signed-out visitors keep
      // whatever the markup already points at (index.html) — untouched.
      // Reuses the same getCurrentUser() call above; no separate auth check.
      if (brandLink && user) {
        brandLink.setAttribute('href', 'dashboard.html');
      }
    });

    logoutBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        DraftzennAuth.logOut().then(function () {
          window.location.href = 'index.html';
        });
      });
    });

    function toggle(isSignedIn) {
      signedOutEls.forEach(function (el) {
        el.style.display = isSignedIn ? 'none' : '';
      });
      signedInEls.forEach(function (el) {
        el.style.display = isSignedIn ? '' : 'none';
      });
    }
  }
})();
