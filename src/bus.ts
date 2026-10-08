// Messages between the main window and the settings window. Tauri events
// in the app; a BroadcastChannel in the browser preview.
import type { Settings } from "./settings";

export type Message =
  | { kind: "settings"; settings: Settings }   // live settings from the settings window
  | { kind: "themes" };                        // a preset was saved; reload the list

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

// Open (or focus) the settings window; `fallback` runs if it can't open.
export async function openSettingsWindow(fallback: () => void): Promise<void> {
  if (!inTauri) {
    window.open(`${location.pathname}#settings`, "tembo-settings", "width=560,height=800");
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel("settings");
  if (existing) { await existing.setFocus(); return; }
  const win = new WebviewWindow("settings", {
    url: "index.html#settings",
    title: "Tembo settings",
    width: 560,
    height: 800,
    minWidth: 420,
    titleBarStyle: "overlay",
    hiddenTitle: true,
  });
  void win.once("tauri://error", (e) => { console.error("settings window", e); fallback(); });
}
