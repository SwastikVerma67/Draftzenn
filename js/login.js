(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('login-form');
    if (!form) return;

    var emailField = document.getElementById('field-email');
    var passwordField = document.getElementById('field-password');
    var banner = document.getElementById('form-banner');
    var submitBtn = document.getElementById('login-submit');

    document.querySelectorAll('.password-toggle').forEach(DraftzennForm.wirePasswordToggle);

    // Already signed in? Skip the login flow entirely.
    if (window.DraftzennAuth) {
      DraftzennAuth.getCurrentUser().then(function (user) {
        // TEMP DEBUG — remove once the redirect issue is confirmed fixed.
        console.log('[Draftzenn][debug] login: already-signed-in check ->', user);
        if (user) window.location.href = 'dashboard.html';
      });
    }

    [emailField, passwordField].forEach(function (fieldEl) {
      var input = fieldEl.querySelector('input');
      input.addEventListener('input', function () {
        DraftzennForm.clearFieldError(fieldEl);
        DraftzennForm.hideBanner(banner);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      DraftzennForm.hideBanner(banner);

      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;

      var emailError = DraftzennForm.validateEmail(email);
      var passwordError = DraftzennForm.validatePassword(password);

      toggleFieldError(emailField, emailError);
      toggleFieldError(passwordField, passwordError);

      if (emailError || passwordError) {
        var firstInvalid = form.querySelector('.has-error input');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      DraftzennForm.setLoading(submitBtn, true);

      DraftzennAuth.logIn({ email: email, password: password })
        .then(function (user) {
          console.log('[Draftzenn][debug] login: signInWithPassword succeeded ->', user);
          DraftzennForm.showBanner(banner, 'Welcome back. Redirecting…', 'success');
          setTimeout(function () {
            window.location.href = 'dashboard.html';
          }, 700);
        })
        .catch(function (err) {
          console.error('[Draftzenn][debug] login: signInWithPassword failed ->', err);
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
