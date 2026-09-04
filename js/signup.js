(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('signup-form');
    if (!form) return;

    var nameField = document.getElementById('field-name');
    var emailField = document.getElementById('field-email');
    var passwordField = document.getElementById('field-password');
    var banner = document.getElementById('form-banner');
    var submitBtn = document.getElementById('signup-submit');

    document.querySelectorAll('.password-toggle').forEach(DraftzennForm.wirePasswordToggle);

    // Already signed in? Skip the signup flow entirely.
    if (window.DraftzennAuth) {
      DraftzennAuth.getCurrentUser().then(function (user) {
        if (user) window.location.href = 'dashboard.html';
      });
    }

    [nameField, emailField, passwordField].forEach(function (fieldEl) {
      var input = fieldEl.querySelector('input');
      input.addEventListener('input', function () {
        DraftzennForm.clearFieldError(fieldEl);
        DraftzennForm.hideBanner(banner);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      DraftzennForm.hideBanner(banner);

      var name = document.getElementById('name').value;
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;

      var nameError = DraftzennForm.validateName(name);
      var emailError = DraftzennForm.validateEmail(email);
      var passwordError = DraftzennForm.validatePassword(password, { enforceStrength: true });

      toggleFieldError(nameField, nameError);
      toggleFieldError(emailField, emailError);
      toggleFieldError(passwordField, passwordError);

      if (nameError || emailError || passwordError) {
        var firstInvalid = form.querySelector('.has-error input');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      DraftzennForm.setLoading(submitBtn, true);

      DraftzennAuth.signUp({ name: name, email: email, password: password })
        .then(function (user) {
          if (user && user.needsEmailConfirmation) {
            // No session yet — Supabase project requires email confirmation
            // before the account can log in. Send them to login, not the
            // dashboard, since there's nothing authenticated to show yet.
            DraftzennForm.setLoading(submitBtn, false);
            DraftzennForm.showBanner(
              banner,
              'Account created. Check your email to confirm your address, then log in.',
              'success'
            );
            form.reset();
            return;
          }

          DraftzennForm.showBanner(banner, 'Account created. Redirecting…', 'success');
          setTimeout(function () {
            window.location.href = 'dashboard.html';
          }, 700);
        })
        .catch(function (err) {
          DraftzennForm.setLoading(submitBtn, false);
          DraftzennForm.showBanner(banner, err.message || 'Something went wrong. Please try again.');
        });
    });

    function toggleFieldError(fieldEl, message) {
      if (message) {
        DraftzennForm.setFieldError(fieldEl, message);
      } else {
        DraftzennForm.clearFieldError(fieldEl);
      }
    }
  });
})();
