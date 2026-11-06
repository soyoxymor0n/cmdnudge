// Legal pages: theme follows the saved choice; the back control uses history when there is one.
document.querySelectorAll('[data-back]').forEach((b) =>
  b.addEventListener('click', (e) => {
    if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) { e.preventDefault(); history.back(); }
  }),
);
