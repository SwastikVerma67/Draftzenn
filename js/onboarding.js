/**
 * Draftzenn — Creator Onboarding
 * ---------------------------------------------------------------------------
 * Guards + wires the onboarding form.
 *
 *   - Requires an authenticated session (redirects to login.html otherwise).
 *   - First-time visit (no profile yet): shows the form, and on save marks
 *     a one-time "welcome" flag so the dashboard can greet the creator.
 *   - Already onboarded, opened normally (no ?edit=1): skips straight to
 *     the dashboard — onboarding should only ever show once per account.
 *   - Already onboarded, opened as dashboard.html's "Edit profile" link
 *     (?edit=1): pre-fills the form with the saved profile and lets the
 *     creator update it in place.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var WELCOME_FLAG_KEY = 'draftzenn_show_welcome';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('onboarding-form');
    if (!form) return;

    if (!window.DraftzennAuth || !window.DraftzennProfile) return;

    var card = document.querySelector('[data-onboarding-card]');
    var banner = document.getElementById('form-banner');
    var submitBtn = document.getElementById('onboarding-submit');
    var submitLabel = document.querySelector('[data-onboarding-submit-label]');
    var title = document.querySelector('[data-onboarding-title]');
    var subhead = document.querySelector('[data-onboarding-subhead]');
    var eyebrow = document.querySelector('[data-onboarding-eyebrow]');
    var backLink = document.querySelector('[data-onboarding-back-link]');
    var footNote = document.querySelector('[data-onboarding-foot-note]');

    var fields = {
      creatorName: document.getElementById('field-creator-name'),
      platform: document.getElementById('field-platform'),
      niche: document.getElementById('field-niche'),
      contentType: document.getElementById('field-content-type')
    };

    var isEditMode = /[?&]edit=1\b/.test(window.location.search);

    wireChoiceGroups();

    DraftzennAuth.getCurrentUser()
      .then(function (user) {
        if (!user) {
          window.location.href = 'login.html';
          return undefined; // signal: already redirecting, nothing more to do
        }

        // IMPORTANT: a failure here (RLS hiccup, table not migrated yet, a
        // transient network error, etc.) is NOT the same thing as "not
        // signed in". It must not be allowed to fall through to a catch
        // that redirects to login.html — the user IS authenticated. That
        // was the actual bug behind "Edit Profile does nothing": clicking
        // Edit Profile navigates to onboarding.html?edit=1, the profile
        // fetch throws, the old catch-all sent the user to login.html,
        // and since they were still actually signed in, login.js's own
        // "already signed in -> dashboard" guard immediately bounced them
        // straight back to dashboard.html — a redirect loop that looks
        // exactly like the button did nothing. Same fix as dashboard.js.
        return DraftzennProfile.getProfile()
          .then(function (profile) {
            return { profile: profile };
          })
          .catch(function (profileErr) {
            console.error(
              '[Draftzenn][debug] onboarding: profile fetch failed — staying on this page ' +
              'instead of redirecting. Raw error:',
              profileErr
            );
            return { profileError: true };
          });
      })
      .then(function (result) {
        if (!result) return; // getCurrentUser() found no session, already redirecting to login.

        if (result.profileError) {
          // Couldn't confirm the saved profile due to a non-auth error.
          // Show the form rather than bouncing the user out — in edit mode
          // it opens without prefilled values and a banner explains why,
          // so the creator can still fill it in and save; in first-time
          // mode it's indistinguishable from a fresh account.
          if (isEditMode) {
            switchToEditMode();
            DraftzennForm.showBanner(
              banner,
              'Couldn\u2019t load your saved profile right now, so this form isn\u2019t pre-filled. ' +
              'You can still fill it in and save — it will update your existing profile.'
            );
          }
          reveal();
          return;
        }

        var profile = result.profile;

        if (profile === null && !isEditMode) {
          // Fresh account, first time here — show the form as-is.
          reveal();
          return;
        }

        if (!profile && isEditMode) {
          // Someone hit ?edit=1 before ever completing onboarding — treat
          // it the same as first-time onboarding.
          reveal();
          return;
        }

        if (profile && !isEditMode) {
          // Already onboarded, arrived here normally — don't show it again.
          window.location.href = 'dashboard.html';
          return;
        }

        // Already onboarded, editing on purpose.
        prefill(profile);
        switchToEditMode();
        reveal();
      })
      .catch(function (err) {
        // Truly unexpected error (not a normal "not signed in" or "profile
        // fetch failed" case, both handled above).
        console.error('[Draftzenn][debug] onboarding: unexpected error in auth/profile chain:', err);
        window.location.href = 'login.html';
      });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      DraftzennForm.hideBanner(banner);

      var data = readForm();
      var errors = validate(data);

      Object.keys(fields).forEach(function (key) {
        toggleFieldError(fields[key], errors[key]);
      });

      if (Object.keys(errors).length) {
        var firstInvalid = form.querySelector('.has-error');
        if (firstInvalid) {
          var firstInput = firstInvalid.querySelector('input');
          if (firstInput) firstInput.focus();
        }
        return;
      }

      DraftzennForm.setLoading(submitBtn, true);

      DraftzennProfile.saveProfile(data)
        .then(function () {
          if (isEditMode) {
            DraftzennForm.setLoading(submitBtn, false);
            DraftzennForm.showBanner(banner, 'Profile updated. Redirecting to your dashboard…', 'success');
            setTimeout(function () {
              window.location.href = 'dashboard.html';
            }, 700);
          } else {
            try {
              sessionStorage.setItem(WELCOME_FLAG_KEY, '1');
            } catch (e) {
              // sessionStorage unavailable (e.g. private mode) — non-fatal,
              // the dashboard will just skip the one-time welcome banner.
            }
            DraftzennForm.showBanner(banner, 'Your Creator Radar is ready. Redirecting…', 'success');
            setTimeout(function () {
              window.location.href = 'dashboard.html';
            }, 700);
          }
        })
        .catch(function (err) {
          DraftzennForm.setLoading(submitBtn, false);
          DraftzennForm.showBanner(banner, err.message || 'Something went wrong. Please try again.');
        });
    });

    // ---- helpers ----------------------------------------------------------

    function reveal() {
      if (card) card.style.visibility = '';
    }

    function switchToEditMode() {
      if (eyebrow) eyebrow.textContent = 'Edit profile';
      if (title) title.textContent = 'Update your creator profile';
      if (subhead) {
        subhead.textContent = 'Change any of the details below — Creator Radar will use the latest info right away.';
      }
      if (submitLabel) submitLabel.textContent = 'Save changes';
      if (backLink) backLink.style.display = '';
      if (footNote) footNote.style.display = 'none';
    }

    function wireChoiceGroups() {
      document.querySelectorAll('[data-choice-group]').forEach(function (group) {
        var pills = group.querySelectorAll('.choice-pill');
        pills.forEach(function (pill) {
          var input = pill.querySelector('input');
          input.addEventListener('change', function () {
            pills.forEach(function (p) { p.classList.remove('is-selected'); });
            if (input.checked) pill.classList.add('is-selected');

            var fieldKey = group.getAttribute('data-choice-group');
            DraftzennForm.clearFieldError(fields[fieldKey]);
            DraftzennForm.hideBanner(banner);
          });
        });
      });

      var nameInput = document.getElementById('creator-name');
      nameInput.addEventListener('input', function () {
        DraftzennForm.clearFieldError(fields.creatorName);
        DraftzennForm.hideBanner(banner);
      });
    }

    function setChoiceGroupValue(fieldKey, value) {
      var group = document.querySelector('[data-choice-group="' + fieldKey + '"]');
      if (!group) return;
      group.querySelectorAll('.choice-pill').forEach(function (pill) {
        var input = pill.querySelector('input');
        var match = input.value === value;
        input.checked = match;
        pill.classList.toggle('is-selected', match);
      });
    }

    function prefill(profile) {
      document.getElementById('creator-name').value = profile.creatorName || '';
      setChoiceGroupValue('platform', profile.platform);
      setChoiceGroupValue('niche', profile.niche);
      setChoiceGroupValue('contentType', profile.contentType);
    }

    function readForm() {
      return {
        creatorName: document.getElementById('creator-name').value,
        platform: getChoiceGroupValue('platform'),
        niche: getChoiceGroupValue('niche'),
        contentType: getChoiceGroupValue('contentType')
      };
    }

    function getChoiceGroupValue(fieldKey) {
      var checked = document.querySelector('[data-choice-group="' + fieldKey + '"] input:checked');
      return checked ? checked.value : '';
    }

    function validate(data) {
      var errors = {};

      var nameError = DraftzennForm.validateName(data.creatorName);
      if (nameError) errors.creatorName = nameError;

      if (!data.platform) errors.platform = 'Choose your primary platform.';
      if (!data.niche) errors.niche = 'Choose a niche or category.';
      if (!data.contentType) errors.contentType = 'Choose a content type.';

      return errors;
    }

    function toggleFieldError(fieldEl, message) {
      if (message) {
        DraftzennForm.setFieldError(fieldEl, message);
      } else {
        DraftzennForm.clearFieldError(fieldEl);
      }
    }
  });
})();
