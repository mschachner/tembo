import { activeTheme, app, applyActiveTheme, loadThemes, persistSettings } from "../app";
import { deleteTheme, writeTheme } from "../backend";
import { h } from "../dom";
import { nav } from "../nav";
import { refreshBanner } from "../shell";
import { publish } from "../bus";
import { sounds } from "../sound";
import { THEME_VARS, type VarSpec } from "../theme";

function rerender(): void {
  nav.home("settings");
}

const BANNER_KEYS = new Set(["bannerEdgePos", "edgeSmooth", "edgeDither", "bannerHeight", "bannerImage", "bannerY", "tabs", "surfaces", "contrast", "plate", "plateBlur"]);

function setOverride(key: string, value: string | number): void {
  app.settings.overrides[key] = value;
  applyActiveTheme();
  persistSettings();
  if (BANNER_KEYS.has(key)) refreshBanner();
  syncModified();
}

// Show each control's reset link, the preset's modified marker, and the
// reset-to-preset button according to the current overrides, without a
// redraw (which would interrupt a slider drag).
function syncModified(): void {
  const keys = new Set(Object.keys(app.settings.overrides));
  for (const row of document.querySelectorAll<HTMLElement>(".control[data-key]")) {
    row.classList.toggle("overridden", keys.has(row.dataset.key!));
  }
  document.querySelector(".settings")?.classList.toggle("modified", keys.size > 0);
}

function resetAll(): void {
  app.settings.overrides = {};
  applyActiveTheme();
  persistSettings();
  rerender();
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
    case "em":
    case "scale": {
      const el = h("input", { type: "range", min: spec.min, max: spec.max, step: spec.step, value: String(value) });
      const unit = spec.kind === "px" ? "px" : spec.kind === "pct" ? "%" : spec.kind === "em" ? "em" : "";
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
      const el = h("input", { type: "text", value: String(value), class: "text",
        placeholder: spec.kind === "text" && spec.key !== "font" ? "same as body font" : "" });
      el.addEventListener("change", () => setOverride(spec.key, el.value));
      input = el;
    }
  }

  const reset = h("button", {
    class: "quiet tiny control-reset",
    onclick: () => { delete app.settings.overrides[spec.key]; applyActiveTheme(); persistSettings(); rerender(); },
  }, "reset");
  return h("div", { class: `control ${overridden ? "overridden" : ""}`, "data-key": spec.key }, h("label", {}, spec.label), input, readout, reset);
}

const openGroups = new Set<string>();

export function settingsView(): Node {
  const presetButtons = [...app.presets.keys()].map((name) => {
    const del = h("button", { class: "preset-delete", title: `Delete ${name}`, "aria-label": `Delete ${name}` }, "×");
    // Two clicks to delete: the first arms the button for three seconds.
    let armed = 0;
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!armed) {
        del.classList.add("armed"); del.textContent = "delete";
        armed = window.setTimeout(() => { armed = 0; del.classList.remove("armed"); del.textContent = "×"; }, 3000);
        return;
      }
      window.clearTimeout(armed);
      if (app.presets.size <= 1) return; // keep at least one
      await deleteTheme(name);
      await loadThemes();
      if (app.settings.preset === name) {
        app.settings.preset = [...app.presets.keys()][0];
        app.settings.overrides = {};
        applyActiveTheme();
      }
      persistSettings();
      void publish({ kind: "themes" });
      rerender();
    });
    return h(
      "span",
      { class: `preset-chip ${name === app.settings.preset ? "active" : ""}` },
      h("button", { class: "preset", onclick: () => {
        app.settings.preset = name;
        app.settings.overrides = {};
        applyActiveTheme();
        persistSettings();
        rerender();
      } }, name),
      app.presets.size > 1 ? del : null,
    );
  });

  const nameInput = h("input", { type: "text", class: "text", placeholder: "preset name" });
  const saveButton = h("button", { onclick: async () => {
    const name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!name) return;
    await writeTheme(name, JSON.stringify(activeTheme(), null, 2));
    await loadThemes();
    app.settings.preset = name;
    app.settings.overrides = {};
    persistSettings();
    void publish({ kind: "themes" });
    rerender();
  } }, "Save as preset");

  const soundToggle = h("input", { type: "checkbox" });
  soundToggle.checked = app.settings.sound.enabled;
  soundToggle.addEventListener("change", () => { app.settings.sound.enabled = soundToggle.checked; persistSettings(); });
  const volume = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: String(app.settings.sound.volume) });
  volume.addEventListener("input", () => { app.settings.sound.volume = Number(volume.value); persistSettings(); });
  volume.addEventListener("change", () => sounds.accept());

  const groupsOf = (keys: string[]) => keys.map((k) => THEME_VARS.find((v) => v.key === k)!).map(control);

  // A collapsible group; which ones are open survives redraws.
  const group = (name: string, ...children: Node[]) => {
    const d = h("details", { class: "group" }, h("summary", {}, name), ...children);
    d.open = openGroups.has(name);
    d.addEventListener("toggle", () => { if (d.open) openGroups.add(name); else openGroups.delete(name); });
    return h("section", {}, d);
  };

  return h(
    "div",
    { class: `settings ${Object.keys(app.settings.overrides).length ? "modified" : ""}` },
    h("h1", { class: "settings-title" }, "Settings"),
    h(
      "section",
      {},
      h("h2", {}, "Preset"),
      h("div", { class: "presets" }, ...presetButtons),
      h("div", { class: "save-preset" }, nameInput, saveButton,
        h("button", { class: "reset-all", onclick: resetAll, title: "Discard changes to this preset" }, `Reset to ${app.settings.preset}`)),
    ),
    group("Colors", ...groupsOf(["bg", "bg2", "bg3", "fg", "fg2", "fg3", "accent", "line", "instant", "slow", "missed"])),
    group("Banner", ...groupsOf(["bannerImage", "bannerEdgePos", "edgeSmooth", "edgeDither", "bannerHeight", "bannerY"])),
    group("Surfaces", ...groupsOf(["tabs", "surfaces", "contrast", "plate", "plateBlur"])),
    group("Fonts", ...groupsOf(["font", "fontSize", "fontMono", "monoScale", "titleFont", "titleSize", "titleWeight", "titleTracking", "headingFont", "headingSize", "labelSize"])),
    group("Layout", ...groupsOf(["contentWidth", "wideWidth", "lineHeight", "space", "rowPad", "radius", "plateRadius", "cardMin", "slotCols"])),
    group("Sound",
      h("div", { class: "control" }, h("label", {}, "Enabled"), soundToggle),
      h("div", { class: "control" }, h("label", {}, "Volume"), volume),
      h("div", { class: "control" }, h("label", {}, "Preview"),
        h("button", { class: "quiet tiny", onclick: sounds.accept }, "accept"),
        h("button", { class: "quiet tiny", onclick: sounds.reject }, "reject"),
        h("button", { class: "quiet tiny", onclick: sounds.complete }, "complete"))),
  );
}
