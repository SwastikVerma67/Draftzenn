/**
 * Draftzenn — Dashboard guard
 * ---------------------------------------------------------------------------
 * Requires an authenticated session. Redirects to login.html if there isn't
 * one, then requires a completed Creator Radar profile — redirects to
 * onboarding.html if the user hasn't finished onboarding yet.
 *
 * Once both checks pass, fills in the user's name/email and the niche /
 * platform / content-type context chips from their saved profile, and shows
 * a one-time "Your Creator Radar is ready" banner right after onboarding
 * completes (not on every subsequent login).
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var WELCOME_FLAG_KEY = 'draftzenn_show_welcome';

  document.addEventListener('DOMContentLoaded', function () {
    var content = document.querySelector('[data-dashboard-content]');
    var currentUser = null;

    if (!window.DraftzennAuth || !window.DraftzennProfile) return;

    DraftzennAuth.getCurrentUser()
      .then(function (user) {
        // TEMP DEBUG — remove once the redirect issue is confirmed fixed.
        console.log('[Draftzenn][debug] dashboard: getCurrentUser() resolved:', user);

        if (!user) {
          console.log('[Draftzenn][debug] dashboard: no authenticated user -> redirecting to login.html');
          window.location.href = 'login.html';
          return undefined; // signal: already redirecting
        }

        currentUser = user;

        // Fallback paint while the profile loads (and for the profileError
        // path below) — the source of truth for the welcome name is the
        // saved creator_name from creator_profiles, filled in by
        // fillContext() once the profile resolves. This is only ever
        // shown pre-profile-load or if the profile fetch itself fails.
        var nameEls = document.querySelectorAll('[data-dashboard-name]');
        var emailEls = document.querySelectorAll('[data-dashboard-email]');
        nameEls.forEach(function (el) { el.textContent = user.name || user.email; });
        emailEls.forEach(function (el) { el.textContent = user.email; });

        // IMPORTANT: a failure here (bad RLS policy, table not migrated yet,
        // a network hiccup, etc.) is NOT the same thing as "not signed in".
        // It must not be allowed to fall through to a catch that redirects
        // to login.html — the user IS authenticated at this point. Doing
        // that was the actual bug: login.js's own "already signed in ->
        // go to dashboard" guard would immediately send them right back,
        // producing the login <-> dashboard redirect loop.
        return DraftzennProfile.getProfile()
          .then(function (profile) {
            return { authed: true, profile: profile };
          })
          .catch(function (profileErr) {
            console.error(
              '[Draftzenn][debug] dashboard: profile fetch failed — staying signed in, ' +
              'showing dashboard without profile personalization. Raw error:',
              profileErr
            );
            return { authed: true, profile: undefined, profileError: true };
          });
      })
      .then(function (result) {
        console.log('[Draftzenn][debug] dashboard: resolved state:', result);

        if (!result) return; // already redirected to login above

        if (result.profileError) {
          // Couldn't confirm onboarding status due to a non-auth error.
          // Show the dashboard rather than bouncing to login — the console
          // has the real error (likely: sql/creator_profiles.sql hasn't
          // been run yet, or its RLS policies don't match this project).
          if (content) content.style.display = '';
          return;
        }

        if (!result.profile) {
          console.log('[Draftzenn][debug] dashboard: authenticated, no profile yet -> redirecting to onboarding.html');
          window.location.href = 'onboarding.html';
          return;
        }

        fillContext(result.profile);
        if (window.DraftzennRadar) {
          DraftzennRadar.setProfile(result.profile);
          // Defensive re-fetch: Creator Radar's own DOMContentLoaded handler
          // already fetches Performance/Content History once, but auth may
          // not have been ready yet at that exact moment. Now that we know
          // for certain the user is signed in, refresh so personalized
          // scores are never stuck on stale/empty data.
          if (DraftzennRadar.refreshPersonalization) DraftzennRadar.refreshPersonalization();
        }
        maybeShowWelcomeBanner();

        if (content) content.style.display = '';
      })
      .catch(function (err) {
        // Truly unexpected error (not a normal "not signed in" or "profile
        // fetch failed" case, both handled above). Log it instead of
        // redirecting — redirecting here is what caused the loop before.
        console.error('[Draftzenn][debug] dashboard: unexpected error in auth/profile chain:', err);
      });

    function fillContext(profile) {
      var nameEls = document.querySelectorAll('[data-dashboard-name]');
      var nicheEls = document.querySelectorAll('[data-context-niche]');
      var platformEls = document.querySelectorAll('[data-context-platform]');
      var contentTypeEls = document.querySelectorAll('[data-context-content-type]');

      // Source of truth for the welcome name is the saved creator_name —
      // falls back to the auth user's name/email only if it's ever blank.
      var displayName = profile.creatorName || (currentUser && (currentUser.name || currentUser.email)) || '';
      nameEls.forEach(function (el) { el.textContent = displayName; });

      nicheEls.forEach(function (el) { el.textContent = profile.niche; });
      platformEls.forEach(function (el) { el.textContent = profile.platform; });
      contentTypeEls.forEach(function (el) { el.textContent = profile.contentType; });
    }

    function maybeShowWelcomeBanner() {
      var banner = document.querySelector('[data-welcome-banner]');
      if (!banner) return;

      var shouldShow = false;
      try {
        shouldShow = sessionStorage.getItem(WELCOME_FLAG_KEY) === '1';
        sessionStorage.removeItem(WELCOME_FLAG_KEY);
      } catch (e) {
        shouldShow = false;
      }

      if (!shouldShow) return;

      banner.style.display = '';

      var dismissBtn = banner.querySelector('[data-welcome-dismiss]');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function () {
          banner.style.display = 'none';
        });
      }
    }
  });
})();
