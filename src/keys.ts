// One keyboard handler per screen. Each screen installs its handler after it
// draws; drawing a new screen removes the old one. The listener runs in the
// capture phase, so a screen sees keys before the answer boxes do, and a
// handler that returns true stops the key there.
//
// A key that causes a screen change is not seen by the new screen: the
// handler only receives events created after it was installed (otherwise
// the Enter that submits a quiz's last answer would also press the results
// screen's Enter).

export type KeyHandler = (e: KeyboardEvent) => boolean;

let current: { handler: KeyHandler; since: number } | null = null;

export function setKeys(handler: KeyHandler | null): void {
  current = handler ? { handler, since: performance.now() } : null;
}

window.addEventListener("keydown", (e) => {
  if (!current || e.timeStamp < current.since) return;
  if (current.handler(e)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, { capture: true });

// Is focus in a text field (where letters are typing, not commands)?
export function typing(e: KeyboardEvent): boolean {
  return !!(e.target as HTMLElement).closest?.("input:not([type=checkbox]):not([type=range]):not([type=color]), textarea, select");
}

export function plainKey(e: KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}
