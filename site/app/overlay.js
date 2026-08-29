/* One overlay at a time.

   The search palette and the keyboard-shortcuts list are both modals holding
   the body's scroll, so opening either has to shut the other. They live in
   separate modules and share nothing else, so rather than have the two import
   each other, each registers the way to close it here. */

const closers = new Set();

/** Register an overlay's own close function. */
export const onOverlay = (close) => closers.add(close);

/** Shut every registered overlay except the one asking. */
export function closeOthers(self) {
  for (const close of closers) if (close !== self) close();
}
