/**
 * Draftzenn — Form utilities
 * ---------------------------------------------------------------------------
 * Small, dependency-free helpers for field validation and error display.
 * Shared by signup.html and login.html so the two forms behave consistently.
 * ---------------------------------------------------------------------------
 */

var DraftzennForm = (function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setFieldError(fieldEl, message) {
    var errorEl = fieldEl.querySelector('.field-error');
    fieldEl.classList.add('has-error');
    if (errorEl) {
      errorEl.querySelector('.field-error-text').textContent = message;
    }
    var input = fieldEl.querySelector('input');
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(fieldEl) {
    fieldEl.classList.remove('has-error');
    var input = fieldEl.querySelector('input');
    if (input) input.removeAttribute('aria-invalid');
  }

  function showBanner(bannerEl, message, variant) {
    bannerEl.querySelector('.form-banner-text').textContent = message;
    bannerEl.classList.remove('is-success');
    if (variant === 'success') bannerEl.classList.add('is-success');
    bannerEl.classList.add('is-visible');
  }

  function hideBanner(bannerEl) {
    bannerEl.classList.remove('is-visible');
  }

  function validateName(value) {
    if (!value.trim()) return 'Enter your name.';
    if (value.trim().length < 2) return 'Name must be at least 2 characters.';
    return null;
  }

  function validateEmail(value) {
    if (!value.trim()) return 'Enter your email address.';
    if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
    return null;
  }

  function validatePassword(value, opts) {
    opts = opts || {};
    if (!value) return 'Enter your password.';
    if (opts.enforceStrength) {
      if (value.length < 8) return 'Password must be at least 8 characters.';
      if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
        return 'Password must include at least one letter and one number.';
      }
    }
    return null;
  }

  function setLoading(buttonEl, isLoading) {
    buttonEl.classList.toggle('is-loading', isLoading);
    buttonEl.disabled = isLoading;
  }

  function wirePasswordToggle(toggleBtn) {
    var input = document.getElementById(toggleBtn.getAttribute('data-toggle-for'));
    if (!input) return;

    toggleBtn.addEventListener('click', function () {
      var isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      toggleBtn.classList.toggle('is-visible', !isVisible);
      toggleBtn.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      input.focus({ preventScroll: true });
    });
  }

  return {
    setFieldError: setFieldError,
    clearFieldError: clearFieldError,
    showBanner: showBanner,
    hideBanner: hideBanner,
    validateName: validateName,
    validateEmail: validateEmail,
    validatePassword: validatePassword,
    setLoading: setLoading,
    wirePasswordToggle: wirePasswordToggle
  };
})();
