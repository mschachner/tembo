import { activeTheme, app, applyActiveTheme, loadThemes, persistSettings } from "../app";
import { writeTheme } from "../backend";
import { h } from "../dom";
import { nav } from "../nav";
import { refreshBanner } from "../shell";
import { sounds } from "../sound";
import { THEME_VARS, type VarSpec } from "../theme";

function rerender(): void {
  // Banner and status line read the theme too, so redraw the whole tab.
  nav.home("settings");
}

const BANNER_KEYS = new Set(["bannerEdge", "bannerEdgeSize", "bannerEdgePos", "bannerHeight", "bannerImage", "tabs"]);

function setOverride(key: string, value: string | number): void {
  app.settings.overrides[key] = value;
  applyActiveTheme();
  persistSettings();
  if (BANNER_KEYS.has(key)) refreshBanner();
}

function control(spec: VarSpec): HTMLElement {
  const theme = activeTheme();
  const value = theme[spec.key];
  const overridden = spec.key in app.settings.overrides;
  let input: HTMLElement;
  let readout: HTMLElement | null = null;

  switch (spec.kind) {
    case "choice": {
      const buttons = (spec.options ?? []).map((opt) =>
        h("button", {
          class: `preset small ${opt === String(value) ? "active" : ""}`,
          onclick: () => {
            setOverride(spec.key, opt);
            buttons.forEach((b) => b.classList.toggle("active", b.textContent === opt));
          },
        }, opt),
      );
      input = h("div", { class: "presets" }, ...buttons);
      break;
    }
    case "color": {
      const el = h("input", { type: "color", value: String(value) });
      el.addEventListener("input", () => setOverride(spec.key, el.value));
      input = el;
      break;
    }
    case "px":
    case "pct":
    case "scale": {
      const el = h("input", { type: "range", min: spec.min, max: spec.max, step: spec.step, value: String(value) });
      const unit = spec.kind === "px" ? "px" : spec.kind === "pct" ? "%" : "";
      readout = h("span", { class: "mono small" }, `${value}${unit}`);
      el.addEventListener("input", () => {
        const v = Number(el.value);
        readout!.textContent = `${v}${unit}`;
        setOverride(spec.key, v);
      });
      input = el;
      break;
    }
    default: {
      const el = h("input", { type: "text", value: String(value), class: "text" });
      el.addEventListener("change", () => setOverride(spec.key, el.value));
      input = el;
    }
  }

  const reset = overridden
    ? h("button", { class: "quiet tiny", onclick: () => { delete app.settings.overrides[spec.key]; applyActiveTheme(); persistSettings(); rerender(); } }, "reset")
    : null;
  return h("div", { class: "control" }, h("label", {}, spec.label), input, readout, reset);
}

export function settingsView(): Node {
  const presetButtons = [...app.presets.keys()].map((name) =>
    h(
      "button",
      { class: `preset ${name === app.settings.preset ? "active" : ""}`, onclick: () => {
        app.settings.preset = name;
        app.settings.overrides = {};
        applyActiveTheme();
        persistSettings();
        rerender();
      } },
      name,
    ),
  );

  const nameInput = h("input", { type: "text", class: "text", placeholder: "preset name" });
  const saveButton = h("button", { onclick: async () => {
    const name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!name) return;
    await writeTheme(name, JSON.stringify(activeTheme(), null, 2));
    await loadThemes();
    app.settings.preset = name;
    app.settings.overrides = {};
    persistSettings();
    rerender();
  } }, "Save as preset");

  const soundToggle = h("input", { type: "checkbox" });
  soundToggle.checked = app.settings.sound.enabled;
  soundToggle.addEventListener("change", () => { app.settings.sound.enabled = soundToggle.checked; persistSettings(); });
  const volume = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: String(app.settings.sound.volume) });
  volume.addEventListener("input", () => { app.settings.sound.volume = Number(volume.value); persistSettings(); });
  volume.addEventListener("change", () => sounds.accept());

  const groupsOf = (keys: string[]) => keys.map((k) => THEME_VARS.find((v) => v.key === k)!).map(control);

  return h(
    "div",
    { class: "settings" },
    h("section", {}, h("h2", {}, "Preset"), h("div", { class: "presets" }, ...presetButtons)),
    h("section", {}, h("h2", {}, "Colors"), ...groupsOf(["bg", "bg2", "bg3", "fg", "fg2", "fg3", "accent", "line"])),
    h("section", {}, h("h2", {}, "Results"), ...groupsOf(["instant", "slow", "missed"])),
    h("section", {}, h("h2", {}, "Banner"), ...groupsOf(["bannerEdge", "bannerEdgeSize", "bannerEdgePos", "bannerImage", "bannerHeight", "bannerY", "bannerSky", "bannerHills", "bannerSun", "bannerFigure"])),
    h("section", {}, h("h2", {}, "Surfaces"), ...groupsOf(["tabs", "plate", "plateBlur"])),
    h("section", {}, h("h2", {}, "Type and shape"), ...groupsOf(["font", "fontMono", "fontSize", "radius", "space"])),
    h("section", {}, h("h2", {}, "Sound"),
      h("div", { class: "control" }, h("label", {}, "Enabled"), soundToggle),
      h("div", { class: "control" }, h("label", {}, "Volume"), volume),
      h("div", { class: "control" }, h("label", {}, "Preview"),
        h("button", { class: "quiet tiny", onclick: sounds.accept }, "accept"),
        h("button", { class: "quiet tiny", onclick: sounds.reject }, "reject"),
        h("button", { class: "quiet tiny", onclick: sounds.complete }, "complete"))),
    h("section", {}, h("h2", {}, "Save"), h("div", { class: "control" }, nameInput, saveButton)),
  );
}
