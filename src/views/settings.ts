import { activeTheme, app, applyActiveTheme, loadThemes, persistSettings, reloadHistory } from "../app";
import { clearAttempts, deleteTheme, openPath, writeTheme } from "../backend";
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

// Overwrite the selected custom preset with the current look.
async function saveCurrent(): Promise<void> {
  const name = app.settings.preset;
  if (!app.customPresets.has(name)) return;
  await writeTheme(name, JSON.stringify(activeTheme(), null, 2));
  await loadThemes();
  app.settings.overrides = {};
  persistSettings();
  void publish({ kind: "themes" });
  rerender();
}

function resetAll(): void {
  app.settings.overrides = {};
  applyActiveTheme();
  persistSettings();
  rerender();
}

function control(spec: VarSpec, labelText = spec.label): HTMLElement {
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
      const el = h("input", { type: "color", value: String(value || (spec.key === "labelColor" ? theme.fg3 : "#000000")) });
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
  if (spec.kind === "color") {
    // Compact form for the color grid: swatch, name, reset.
    return h("div", { class: `control color-control ${overridden ? "overridden" : ""}`, "data-key": spec.key },
      input, h("label", {}, labelText), reset);
  }
  return h("div", { class: `control ${overridden ? "overridden" : ""}`, "data-key": spec.key }, h("label", {}, labelText), input, readout, reset);
}

const openGroups = new Set<string>();
let settingsTab: "appearance" | "app" = "appearance";

export function settingsView(): Node {
  const tabs = h(
    "nav",
    { class: "settings-tabs" },
    ...([["appearance", "Appearance"], ["app", "App"]] as const).map(([id, label]) =>
      h("button", {
        class: `tab ${settingsTab === id ? "active" : ""}`,
        onclick: () => { settingsTab = id; rerender(); },
      }, label),
    ),
  );
  return h(
    "div",
    { class: `settings ${Object.keys(app.settings.overrides).length ? "modified" : ""}` },
    h("h1", { class: "settings-title" }, "Settings"),
    tabs,
    ...(settingsTab === "appearance" ? appearanceSections() : appSections()),
  );
}

function appearanceSections(): Node[] {
  const presetChip = (name: string) => {
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
      app.customPresets.has(name) ? del : null,   // defaults can't be deleted
    );
  };
  const names = [...app.presets.keys()];
  const defaults = names.filter((n) => !app.customPresets.has(n));
  const customs = names.filter((n) => app.customPresets.has(n));

  const nameInput = h("input", { type: "text", class: "text", placeholder: "preset name" });
  const saveStatus = h("div", { class: "save-status error small" });
  const saveButton = h("button", { onclick: async () => {
    const name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!name) return;
    try {
      await writeTheme(name, JSON.stringify(activeTheme(), null, 2));
    } catch (e) {
      saveStatus.textContent = String(e).replace(/^Error: /, "");
      return;
    }
    await loadThemes();
    app.settings.preset = name;
    app.settings.overrides = {};
    persistSettings();
    void publish({ kind: "themes" });
    rerender();
  } }, "Save as preset");

  const groupsOf = (keys: string[]) => keys.map((k) => control(spec(k)));
  const spec = (k: string) => THEME_VARS.find((v) => v.key === k)!;
  // [key, short label] pairs under a small subheading.
  const sub = (title: string, items: [string, string][]) =>
    h("div", { class: "subgroup" }, h("h3", {}, title), ...items.map(([k, l]) => control(spec(k), l)));
  const colorCol = (title: string, items: [string, string][]) =>
    h("div", { class: "color-col" }, h("h3", {}, title), ...items.map(([k, l]) => control(spec(k), l)));

  // A collapsible group; which ones are open survives redraws.
  const group = (name: string, ...children: Node[]) => {
    const d = h("details", { class: "group" }, h("summary", {}, name), ...children);
    d.open = openGroups.has(name);
    d.addEventListener("toggle", () => { if (d.open) openGroups.add(name); else openGroups.delete(name); });
    return h("section", {}, d);
  };

  return [
    h(
      "section",
      {},
      h("h2", {}, "Preset"),
      h("div", { class: "preset-row" }, h("span", { class: "preset-row-label" }, "Defaults"),
        h("div", { class: "presets" }, ...defaults.map(presetChip))),
      customs.length
        ? h("div", { class: "preset-row" }, h("span", { class: "preset-row-label" }, "Custom"),
            h("div", { class: "presets" }, ...customs.map(presetChip)))
        : null,
      h("div", { class: "save-preset" }, nameInput, saveButton,
        app.customPresets.has(app.settings.preset)
          ? h("button", { class: "save-current", onclick: saveCurrent, title: "Write these changes into this preset" }, `Save to ${app.settings.preset}`)
          : null,
        h("button", { class: "reset-all", onclick: resetAll, title: "Discard changes to this preset" }, `Reset to ${app.settings.preset}`)),
      saveStatus,
    ),
    group("Colors", h("div", { class: "color-grid" },
      colorCol("Backgrounds", [["bg", "Page"], ["bg2", "Surface"], ["bg3", "Raised"], ["line", "Lines"]]),
      colorCol("Text", [["fg", "Primary"], ["fg2", "Secondary"], ["fg3", "Muted"], ["labelColor", "Labels"]]),
      colorCol("Accent", [["accent", "Accent"]]),
      colorCol("Results", [["instant", "Instant"], ["slow", "Slow"], ["missed", "Missed"]]),
    )),
    group("Banner", ...groupsOf(["bannerImage", "bannerEdgePos", "edgeSmooth", "edgeDither", "bannerHeight", "bannerY"])),
    group("Surfaces", ...groupsOf(["tabs", "surfaces", "contrast", "plate", "plateBlur"])),
    group("Fonts",
      sub("Body", [["font", "Font"], ["fontSize", "Size"]]),
      sub("Numbers", [["fontMono", "Font"], ["monoScale", "Size (× body)"]]),
      sub("Title", [["titleFont", "Font"], ["titleSize", "Size"], ["titleWeight", "Weight"], ["titleTracking", "Letter spacing"]]),
      sub("Headings", [["headingFont", "Font"], ["headingSize", "Size"]]),
      sub("Section labels", [["labelFont", "Font"], ["labelSize", "Size (× body)"], ["labelWeight", "Weight"], ["labelTracking", "Letter spacing"], ["labelCase", "Case"]]),
    ),
    group("Layout", ...groupsOf(["contentWidth", "wideWidth", "lineHeight", "space", "rowPad", "radius", "plateRadius", "cardMin", "slotCols"])),
  ];
}

function appSections(): Node[] {
  const soundToggle = h("input", { type: "checkbox" });
  soundToggle.checked = app.settings.sound.enabled;
  soundToggle.addEventListener("change", () => { app.settings.sound.enabled = soundToggle.checked; persistSettings(); });
  const volume = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: String(app.settings.sound.volume) });
  volume.addEventListener("input", () => { app.settings.sound.volume = Number(volume.value); persistSettings(); });
  volume.addEventListener("change", () => sounds.accept());

  // Grading
  const thr = app.settings.grading.instantSeconds;
  const thrReadout = h("span", { class: "mono small" }, `${thr.toFixed(1)}s`);
  const thrSlider = h("input", { type: "range", min: 0.5, max: 4, step: 0.1, value: String(thr) });
  thrSlider.addEventListener("input", () => {
    app.settings.grading.instantSeconds = Number(thrSlider.value);
    thrReadout.textContent = `${Number(thrSlider.value).toFixed(1)}s`;
    persistSettings();
  });
  const calib = app.attempts.filter((a) => a.version === 2 && a.kind === "calibration").at(-1);
  const calibQuiz = app.quizzes.find((q) => q.kind === "calibration");

  // Danger zone: two clicks, the first arms the button for four seconds.
  const clearButton = h("button", { class: "danger" }, "Clear all history");
  const clearStatus = h("span", { class: "muted small" });
  let armed = 0;
  clearButton.addEventListener("click", async () => {
    if (!armed) {
      clearButton.classList.add("armed"); clearButton.textContent = "Click again to clear";
      armed = window.setTimeout(() => { armed = 0; clearButton.classList.remove("armed"); clearButton.textContent = "Clear all history"; }, 4000);
      return;
    }
    window.clearTimeout(armed); armed = 0;
    try {
      const backup = await clearAttempts();
      await reloadHistory();
      void publish({ kind: "history" });
      clearButton.classList.remove("armed"); clearButton.textContent = "Clear all history";
      clearStatus.textContent = backup ? `Cleared. Backup: ${backup.split("/").pop()}` : "Cleared (there was no history).";
    } catch (e) {
      clearStatus.textContent = String(e);
    }
  });

  return [
    h("section", {}, h("h2", {}, "Sound"),
      h("div", { class: "control" }, h("label", {}, "Enabled"), soundToggle),
      h("div", { class: "control" }, h("label", {}, "Volume"), volume),
      h("div", { class: "control" }, h("label", {}, "Preview"),
        h("button", { class: "quiet tiny", onclick: sounds.accept }, "accept"),
        h("button", { class: "quiet tiny", onclick: sounds.reject }, "reject"),
        h("button", { class: "quiet tiny", onclick: sounds.complete }, "complete"))),
    h("section", {}, h("h2", {}, "Grading"),
      h("div", { class: "control" }, h("label", {}, "Instant below"), thrSlider, thrReadout),
      h("div", { class: "control" }, h("label", {}, "Typing speed"),
        h("span", { class: "mono" }, `${app.cps.toFixed(1)} ch/s`),
        h("span", { class: "muted small" }, calib
          ? new Date(calib.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "not calibrated"),
        calibQuiz ? h("button", { class: "quiet tiny", onclick: () => publish({ kind: "play", quizId: calibQuiz.id }) }, "Calibrate") : null)),
    h("section", {}, h("h2", {}, "Files"),
      h("div", { class: "control", title: app.root }, h("label", {}, "Open folder"),
        h("button", { class: "quiet tiny", onclick: () => openPath(`${app.root}/quizzes`) }, "quizzes"),
        h("button", { class: "quiet tiny", onclick: () => openPath(`${app.root}/data`) }, "data"),
        h("button", { class: "quiet tiny", onclick: () => openPath(`${app.root}/themes`) }, "themes"))),
    h("section", { class: "danger-zone" }, h("h2", {}, "Danger zone"),
      h("div", { class: "control" }, h("label", {}, "History"), clearButton, clearStatus),
      h("p", { class: "muted small" }, "Moves data/attempts.jsonl to a dated backup in the same folder and starts an empty log. Every quiz becomes new.")),
  ];
}
