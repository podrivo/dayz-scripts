/* What a signature's keywords mean.

   `proto native owned string` is four words of engine contract before the
   name even starts, and none of them is explained anywhere on the way into
   this API — the Enforce Script syntax page is a site away, and nobody has
   it open. So the words explain themselves: rest the pointer on a keyword in
   a signature, a source listing, or a modifier badge, and the tooltip says
   what it commits you to.

   The tip is laid on lazily, on the first pointerover, because a class page
   carries thousands of keyword spans and only the one under the pointer ever
   needs the attribute. tooltip.js does the showing: its own delegated
   listener is registered after this one (see the init order in site/app.js),
   so by the time it looks for [data-tip] on the same event, the attribute is
   there. */

const WORDS = {
  proto: 'Engine function: declared in script, implemented inside the engine. There is no script body to read.',
  native: 'With proto: implemented engine-side, using the native calling convention. No script body, and nothing to override.',
  volatile: 'This engine function may call back into script before it returns.',
  owned: 'The caller gets its own copy of the returned value, not a reference into engine memory.',
  event: 'A callback the engine invokes when the moment the name describes arrives. Override it in a modded class, and keep the super call.',
  modded: 'A layered rewrite of this class from a mod: loaded over the original, with super still reaching the vanilla code.',
  sealed: 'Closed to extension: a sealed class cannot be inherited from.',
  override: 'Replaces the implementation inherited from the base class.',
  static: 'Belongs to the type rather than an instance: called as Type.Name(), and outside any override chain.',
  private: 'Reachable only from inside this class — which includes a modded class of it, since that counts as the class itself.',
  protected: 'Reachable from this class and its subclasses, not from outside.',
  ref: 'A strong reference: the object stays alive for as long as one is held. With none left, a managed object is freed.',
  autoptr: 'A strong reference that also deletes the object when the variable holding it goes away.',
  out: 'Passed back to the caller: what the method assigns here is visible outside the call.',
  inout: 'Passed both ways: the method reads the caller\u2019s value and can write it back.',
  notnull: 'This argument must not be null.',
  thread: 'Runs the call on a script fiber of its own: it can Sleep() without holding up the frame.',
};

/* Where a keyword can appear: a signature (.kw, written by the generator), a
   source listing (.tok-kw, written by highlight.js), and the modifier badges
   on a class title and on \param directions (.badge-mod). */
const HOSTS = ['kw', 'tok-kw', 'badge-mod'];

export function initGlossary() {
  document.addEventListener('pointerover', (e) => {
    const el = e.target;
    if (!el.classList || el.dataset.tip) return;
    if (!HOSTS.some((c) => el.classList.contains(c))) return;
    const tip = WORDS[el.textContent.trim()];
    if (tip) el.dataset.tip = tip;
  });
}
