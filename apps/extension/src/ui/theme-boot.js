/**
 * Synchronous theme boot (extension page).
 * WHY: Apply stored preference before first paint to avoid a dark→light flash.
 * PRIVACY: Theme preference only. Never page data or vault values.
 */
(function bootTheme() {
  try {
    var pref = localStorage.getItem('n-eye.theme') || 'dark';
    var theme = pref;
    if (pref === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    if (theme !== 'light' && theme !== 'dark') {
      theme = 'dark';
      pref = 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-pref', pref);
  } catch (_err) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-theme-pref', 'dark');
  }
})();
