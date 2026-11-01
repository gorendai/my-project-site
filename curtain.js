(() => {
  const curtain = document.getElementById('curtain');
  if (!curtain) {
    return;
  }

  let navigationStarted = false;
  let curtainRevealed = false;
  let revealFallback;

  const revealCurtain = () => {
    if (curtainRevealed || navigationStarted) {
      return;
    }

    curtainRevealed = true;
    window.clearTimeout(revealFallback);
    curtain.classList.add('is-hidden');
  };

  const scheduleCurtainReveal = () => {
    revealFallback = window.setTimeout(revealCurtain, 150);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(revealCurtain);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleCurtainReveal, { once: true });
  } else {
    scheduleCurtainReveal();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      revealCurtain();
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) {
      return;
    }

    navigationStarted = false;
    curtainRevealed = false;
    scheduleCurtainReveal();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest('a[href]');
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.hasAttribute('download') ||
      link.hasAttribute('data-no-curtain') ||
      (link.target && link.target !== '_self')
    ) {
      return;
    }

    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin) {
      return;
    }

    const destinationPath = decodeURIComponent(destination.pathname).replace(/\/+$/, '');
    const currentPath = decodeURIComponent(location.pathname).replace(/\/+$/, '');
    const isCurrentPage = destinationPath === currentPath;

    if (isCurrentPage) {
      if (destination.search === location.search && destination.hash === location.hash) {
        event.preventDefault();
      }
      return;
    }

    event.preventDefault();
    if (navigationStarted) {
      return;
    }

    navigationStarted = true;
    window.clearTimeout(revealFallback);
    curtain.classList.remove('is-hidden');
    const navigationDelay =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.visibilityState !== 'visible'
        ? 0
        : 700;
    window.setTimeout(() => {
      location.href = destination.href;
    }, navigationDelay);
  });
})();