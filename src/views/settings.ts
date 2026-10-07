import { activeTheme, app, applyActiveTheme, loadThemes, persistSettings } from "../app";
import { writeTheme } from "../backend";
import { h } from "../dom";
import { nav } from "../nav";
import { sounds } from "../sound";
import { THEME_VARS, type VarSpec } from "../theme";
import { ELEPHANTS, elephantInfo, elephantSvg } from "../elephants";

function rerender(): void {
  // Banner and status line read the theme too, so redraw the whole tab.
  nav.home("settings");
}

function setOverride(key: string, value: string | number): void {
  app.settings.overrides[key] = value;
  applyActiveTheme();
  persistSettings();
}

function control(spec: VarSpec): HTMLElement {
  const theme = activeTheme();
  const value = theme[spec.key];
  const overridden = spec.key in app.settings.overrides;
  let input: HTMLElement;
  let readout: HTMLElement | null = null;

  switch (spec.kind) {
    case "elephant": {
      const choices = ELEPHANTS.map((e) =>
        h("button", {
          class: `elephant-choice ${e.id === String(value) ? "active" : ""}`,
          title: `${e.species} — ${e.contributor}`,
          onclick: () => { setOverride(spec.key, e.id); rerender(); },
        }, elephantSvg(e.id)),
      );
      const info = elephantInfo(String(value));
      return h("div", {},
        h("div", { class: "control" }, h("label", {}, spec.label), h("div", { class: "elephants" }, ...choices),
          overridden ? h("button", { class: "quiet tiny", onclick: () => { delete app.settings.overrides[spec.key]; persistSettings(); rerender(); } }, "reset") : null),
        h("div", { class: "credit" }, `${info.species} · ${info.contributor} · CC0 · `,
          h("a", { href: info.source, target: "_blank" }, "PhyloPic")));
    }
    case "toggle": {
      const el = h("input", { type: "checkbox" });
      el.checked = Boolean(Number(value));
      el.addEventListener("change", () => { setOverride(spec.key, el.checked ? 1 : 0); rerender(); });
      input = el;
      break;
    }
    case "color": {
      const el = h("input", { type: "color", value: String(value) });
      el.addEventListener("input", () => setOverride(spec.key, el.value));
      input = el;
      break;
    }
    case "px":
    case "scale": {
      const el = h("input", { type: "range", min: spec.min, max: spec.max, step: spec.step, value: String(value) });
      readout = h("span", { class: "mono small" }, spec.kind === "px" ? `${value}px` : String(value));
      el.addEventListener("input", () => {
        const v = Number(el.value);
        readout!.textContent = spec.kind === "px" ? `${v}px` : String(v);
        setOverride(spec.key, v);
        if (spec.key === "bannerHeight") document.documentElement.style.setProperty("--banner-height", `${v}px`);
      });
      input = el;
      break;
    }
    default: {
      const el = h("input", { type: "text", value: String(value), class: "text" });
      el.addEventListener("change", () => { setOverride(spec.key, el.value); if (spec.kind === "image") rerender(); });
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
    h("section", {}, h("h2", {}, "Banner"), ...groupsOf(["elephant", "elephantFlip", "bannerImage", "bannerHeight", "bannerSky", "bannerHills", "bannerSun", "bannerFigure"])),
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
