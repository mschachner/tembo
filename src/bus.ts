// Messages between the main window and the settings window. Tauri events
// in the app; a BroadcastChannel in the browser preview.
import type { Settings } from "./settings";

export type Message =
  | { kind: "settings"; settings: Settings }   // live settings from the settings window
  | { kind: "themes" }                         // a preset was saved or deleted; reload the list
  | { kind: "history" }                        // the attempt log changed on disk; reload it
  | { kind: "play"; quizId: string }           // play a quiz in the main window
  | { kind: "synced" };                        // a newer Watering Hole or synced data arrived; reload

const inTauri = "__TAURI_INTERNALS__" in window;
const channel = inTauri ? null : new BroadcastChannel("tembo");

export async function publish(msg: Message): Promise<void> {
  if (channel) { channel.postMessage(msg); return; }
  const { emit } = await import("@tauri-apps/api/event");
  await emit("tembo", msg);
}

export async function subscribe(handler: (msg: Message) => void): Promise<void> {
  if (channel) { channel.onmessage = (e) => handler(e.data as Message); return; }
  const { listen } = await import("@tauri-apps/api/event");
  await listen<Message>("tembo", (e) => handler(e.payload));
}

let popup: Window | null = null; // browser preview only

// Cmd+, (Ctrl+, elsewhere). In the main window it opens the settings window,
// or brings it to the front if it's already open; in the settings window it
// closes it.
export async function toggleSettingsWindow(fallback: () => void): Promise<void> {
  if (location.hash === "#settings") { await closeSelf(); return; }
  await openSettingsWindow(fallback);
}

async function closeSelf(): Promise<void> {
  if (!inTauri) { window.close(); return; }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

export function bindSettingsShortcut(fallback: () => void): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "," && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void toggleSettingsWindow(fallback);
    }
  });
}

// Open (or focus) the settings window; `fallback` runs if it can't open.
/** Keep the native window's background in step with the theme, so resizing
 *  or reopening never shows white behind the page. */
export async function setWindowBackground(color: string): Promise<void> {
  if (!inTauri || !/^#[0-9a-f]{3,8}$/i.test(color.trim())) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().setBackgroundColor(color.trim());
  } catch (e) {
    console.error("could not set window background", e);
  }
}

/** The current page background as [r, g, b], read from the rendered body. */
function themeBackground(): [number, number, number] | undefined {
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return undefined;
  return [0, 1, 2].map((i) => Math.round(Number(m[i]))) as [number, number, number];
}

export async function openSettingsWindow(fallback: () => void): Promise<void> {
  if (!inTauri) {
    if (popup && !popup.closed) { popup.focus(); return; }
    popup = window.open(`${location.pathname}#settings`, "tembo-settings", "width=640,height=820");
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel("settings");
  if (existing) {
    await existing.unminimize().catch(() => {});
    await existing.show().catch(() => {});
    await existing.setFocus();
    return;
  }
  const win = new WebviewWindow("settings", {
    url: "index.html#settings",
    title: "Tembo settings",
    width: 640,
    height: 820,
    minWidth: 480,
    titleBarStyle: "overlay",
    hiddenTitle: true,
    visible: false,   // shown by the window itself once it has drawn (no white flash)
    // Paint the window in the theme's background from the start, so any frame
    // drawn before the page loads isn't the webview's default white.
    backgroundColor: themeBackground(),
  });
  void win.once("tauri://error", (e) => { console.error("settings window", e); fallback(); });
}

// Windows start hidden and call this after their first render, so they never
// show the webview's blank white page. Animation frames don't run in a
// hidden window, so this waits on a short timer instead; it retries on
// failure, and a fallback timer shows the window regardless.
let shown = false;
export async function showWhenReady(): Promise<void> {
  if (shown || !inTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await new Promise((r) => window.setTimeout(r, 30));
    await getCurrentWindow().show();
    await getCurrentWindow().setFocus();
    shown = true;
  } catch (e) {
    console.error("could not show window", e);
  }
}
window.setTimeout(() => void showWhenReady(), 1200);
window.setTimeout(() => void showWhenReady(), 3000);
