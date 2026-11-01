(() => {
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) {
    return;
  }

  const themeKey = 'research-theme';

  const applyTheme = (theme) => {
    const isSoftGray = theme === 'soft-gray';
    body.classList.toggle('theme-soft-gray', isSoftGray);
    body.classList.toggle('theme-light', !isSoftGray);
    window.localStorage.setItem(themeKey, isSoftGray ? 'soft-gray' : 'light');
  };

  applyTheme(window.localStorage.getItem(themeKey) || 'light');

  themeToggle.addEventListener('click', () => {
    const nextTheme = body.classList.contains('theme-soft-gray') ? 'light' : 'soft-gray';
    applyTheme(nextTheme);
  });

  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const mobileNavMenu = document.getElementById('mobileNavMenu');
  if (mobileNavToggle && mobileNavMenu) {
    mobileNavToggle.addEventListener('click', () => {
      const isOpen = mobileNavMenu.classList.toggle('is-open');
      mobileNavToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
})();
