export function initXrefs() {
  document.querySelector('.main')?.addEventListener('click', (event) => {
    const button = event.target.closest('.xref-less');
    if (!button) return;
    const details = button.closest('.xref-more');
    details.open = false;
    details.querySelector('summary')?.focus();
  });
}
