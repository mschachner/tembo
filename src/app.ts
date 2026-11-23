// Application state: quizzes, the attempt log, calibration, settings, theme.
import { folders, listSeries, listThemes, readAsset, readAttempts, readBanner, readLibrary, writeLibrary, type Folders, type ThemeFile } from "./backend";
import type { Attempt } from "./attempt";
import { appendAttempt } from "./backend";
import { DEFAULT_CPS, gradeOf, setInstantSeconds, typingSpeed } from "./grade";
import { belongsTo, isCalibration, parseLog, type AnyAttempt } from "./log";
import { assembleSeries, parseQuiz, parseSeries, previousChunk, previousLevel, type Quiz, type Series } from "./quiz/format";
import { isDue, localDate, NEW_STATE, replay, type QuizState } from "./schedule";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { configureSound } from "./sound";
import { applyTheme, FALLBACK_THEME, parseTheme, type Theme } from "./theme";
import { publish, setWindowBackground } from "./bus";
import { applyMotion } from "./motion";

export interface Entry {
  quiz: Quiz;
  state: QuizState;
}

export const app = {
  folders: { data: "", hole: "" } as Folders,
  attempts: [] as AnyAttempt[],
  cps: DEFAULT_CPS,
  settings: null as unknown as Settings,
  presets: new Map<string, Theme>(),
  customPresets: new Set<string>(),
  series: [] as Series[],     // every series in the Watering Hole
  quizzes: [] as Quiz[],      // every quiz, across the series
  library: [] as string[],    // ids of the series imported, in import order
  quizErrors: [] as string[],
};

export async function loadAll(): Promise<void> {
  app.folders = await folders();
  app.settings = await loadSettings();
  await loadThemes();
  applyActiveTheme();
  configureSound(app.settings.sound.enabled, app.settings.sound.volume);
  setInstantSeconds(app.settings.grading.instantSeconds);
  applyMotion(app.settings.motion);
  await reloadHistory();
  await loadQuizzes();
}

export async function reloadHistory(): Promise<void> {
  app.attempts = parseLog(await readAttempts());
  app.cps = typingSpeed(app.attempts) ?? DEFAULT_CPS;
}

export async function loadThemes(): Promise<void> {
  const files: ThemeFile[] = await listThemes();
  // Defaults first, in their "order" field; then custom presets by name.
  const rank = (f: ThemeFile) => {
    try { return Number((JSON.parse(f.json) as { order?: number }).order ?? 999); } catch { return 999; }
  };
  files.sort((a, b) => Number(a.custom) - Number(b.custom) || rank(a) - rank(b) || a.name.localeCompare(b.name));
  app.presets = new Map();
  app.customPresets = new Set();
  for (const f of files) {
    try {
      app.presets.set(f.name, parseTheme(f.json));
      if (f.custom) app.customPresets.add(f.name);
    } catch (e) {
      console.warn(`bad theme ${f.name}`, e);
    }
  }
}

// Reads the Watering Hole. A quiz that fails to parse is left out of its
// series; a series that fails as a whole (no series.txt, a quiz outside the
// grid) is left out entirely. Either is reported in quizErrors.
export async function loadQuizzes(): Promise<void> {
  app.library = (await readLibrary()).split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== "" && !s.startsWith("#"));
  app.series = [];
  app.quizzes = [];
  app.quizErrors = [];
  for (const f of await listSeries()) {
    if (f.source === null) {
      app.quizErrors.push(`${f.dir}: no series.txt`);
      continue;
    }
    try {
      const meta = parseSeries(f.source, f.path, f.dir);
      const quizzes: Quiz[] = [];
      for (const q of f.quizzes) {
        try {
          quizzes.push(parseQuiz(q.source, q.path, q.dir, meta));
        } catch (e) {
          app.quizErrors.push(`${q.path}: ${(e as Error).message}`);
        }
      }
      const series = assembleSeries(meta, quizzes);
      app.series.push(series);
      app.quizzes.push(...series.quizzes);
    } catch (e) {
      app.quizErrors.push(`${f.path}: ${(e as Error).message}`);
    }
  }
}

export function activeTheme(): Theme {
  const preset = app.presets.get(app.settings.preset) ?? app.presets.get("wheat") ?? app.presets.values().next().value ?? FALLBACK_THEME;
  return { ...FALLBACK_THEME, ...preset, ...app.settings.overrides };
}

export function applyActiveTheme(): void {
  const theme = activeTheme();
  applyTheme(theme);
  void setWindowBackground(String(theme.bg ?? ""));
  const root = document.documentElement;
  if (!root.hasAttribute("data-theme-ready")) {
    getComputedStyle(document.body).backgroundColor; // commit the first theme without a transition
    root.setAttribute("data-theme-ready", "");
  }
}

export function persistSettings(): void {
  saveSettings(app.settings);
  setInstantSeconds(app.settings.grading.instantSeconds);
  applyMotion(app.settings.motion);
  configureSound(app.settings.sound.enabled, app.settings.sound.volume);
  void publish({ kind: "settings", settings: app.settings });
}

// Settings arriving from the other window.
export function adoptSettings(settings: Settings): void {
  app.settings = settings;
  setInstantSeconds(settings.grading.instantSeconds);
  applyMotion(settings.motion);
  applyActiveTheme();
  configureSound(settings.sound.enabled, settings.sound.volume);
}

export function attemptsOf(quiz: Quiz): AnyAttempt[] {
  return app.attempts.filter((a) => belongsTo(a, quiz));
}

export function stateOf(quiz: Quiz): QuizState {
  const own = attemptsOf(quiz);
  return own.length ? replay(own, (a) => gradeOf(a, app.cps)) : NEW_STATE;
}

export function seriesOf(quiz: Quiz): Series | undefined {
  return app.series.find((s) => s.id === quiz.series);
}

// The quiz this one builds on: the previous level of its chunk, or null at
// the first level.
export function previousOf(quiz: Quiz): Quiz | null {
  const s = seriesOf(quiz);
  return s ? previousLevel(s, quiz) : null;
}

// The chunk before this one, which it waits on: see locked().
export function previousChunkOf(quiz: Quiz): Quiz | null {
  const s = seriesOf(quiz);
  return s ? previousChunk(s, quiz) : null;
}

// Chunks appear one at a time: a chunk after the first stays locked until
// the previous chunk has been cleared once (or retired). A chunk that has
// been played stays in, whatever happens to the one before it.
function waitingOnChunk(quiz: Quiz): boolean {
  const prev = previousChunkOf(quiz);
  if (!prev || prev.retired) return false;
  if (attemptsOf(quiz).length) return false;
  return !attemptsOf(prev).some((a) => a.cleared);
}

// A quiz is locked while its chunk waits on the previous chunk, and beyond
// the first level until the previous level of its chunk is proficient.
export function locked(quiz: Quiz): boolean {
  if (waitingOnChunk(quiz)) return true;
  const prev = previousOf(quiz);
  return !!prev && stateOf(prev).status !== "proficient";
}

// Why a quiz is locked, for display.
export function lockReason(quiz: Quiz): string {
  if (waitingOnChunk(quiz)) return `appears when ${previousChunkOf(quiz)?.title} is cleared`;
  return `unlocks when ${previousOf(quiz)?.title} is proficient`;
}

// Your series: the ones imported from the Watering Hole, plus the typing
// calibration, which everyone has.
export function seriesInLibrary(series: Series): boolean {
  return app.library.includes(series.id) || series.quizzes.some((q) => q.kind === "calibration");
}

// Your quizzes: the unlocked quizzes of the series in your library. A
// level joins on its own as the previous one becomes proficient.
export function inLibrary(quiz: Quiz): boolean {
  if (quiz.kind === "calibration") return true;
  const s = seriesOf(quiz);
  return !!s && seriesInLibrary(s) && !locked(quiz);
}

// Quizzes in your series still waiting on the level before them.
export function lockedQuizzes(): Quiz[] {
  return app.quizzes.filter((q) => locked(q) && app.library.includes(q.series));
}

export function entries(): Entry[] {
  return app.quizzes.filter(inLibrary).map((quiz) => ({ quiz, state: stateOf(quiz) }));
}

// The typing calibration quiz, which everyone has.
export function calibrationQuiz(): Quiz | undefined {
  return app.quizzes.find((q) => q.kind === "calibration");
}

// Has the typing speed been measured yet?
export function calibrated(): boolean {
  return app.attempts.some(isCalibration);
}

// Is anything imported from the Watering Hole?
export function hasImports(): boolean {
  return app.series.some((s) => app.library.includes(s.id));
}

// Someone new calibrates first: with nothing imported and no calibration
// yet, the Watering Hole stays locked until the typing calibration has been
// played once (grades compare answers against the player's typing speed).
export function holeLocked(): boolean {
  return !calibrated() && !hasImports() && !!calibrationQuiz();
}

export const HOLE_LOCK_REASON = "unlocks after typing calibration";

// Importing and removing only change library.txt; history is kept by
// quiz id, so a series removed and imported again picks up where it left off.
export async function importSeries(series: Series): Promise<void> {
  if (seriesInLibrary(series)) return;
  app.library = [...app.library, series.id];
  await writeLibrary(app.library, `Import series: ${series.title}`);
}

export async function removeSeries(series: Series): Promise<void> {
  app.library = app.library.filter((id) => id !== series.id);
  await writeLibrary(app.library, `Remove series: ${series.title}`);
}

export type SeriesStatus = "due" | "new" | "upcoming" | "proficient" | "retired" | "calibration";

// A series stands where its most pressing quiz stands: due if any unlocked
// quiz is due, new if any is unplayed, upcoming while any is learning,
// proficient once every quiz in the grid is; retired once every quiz is.
export function seriesStatus(series: Series, today = localDate(new Date())): SeriesStatus {
  if (series.quizzes.some((q) => q.kind === "calibration")) return "calibration";
  const live = series.quizzes.filter((q) => !q.retired);
  if (!live.length) return "retired";
  const open = live.filter((q) => !locked(q)).map((q) => ({ quiz: q, state: stateOf(q) }));
  if (open.some((e) => e.state.status !== "new" && isDue(e.state, today))) return "due";
  if (open.some((e) => e.state.status === "new")) return "new";
  if (live.every((q) => stateOf(q).status === "proficient")) return "proficient";
  return "upcoming";
}

// The earliest due date among a series' unlocked quizzes ("" when none).
export function seriesDue(series: Series): string {
  return series.quizzes.filter((q) => !q.retired && !locked(q)).map((q) => stateOf(q).dueDate ?? "").filter(Boolean).sort()[0] ?? "";
}

export function playable(quiz: Quiz, state: QuizState, today = localDate(new Date())): boolean {
  if (quiz.kind === "calibration") return true;
  if (quiz.retired || !inLibrary(quiz) || locked(quiz)) return false;
  return isDue(state, today);
}

export function recordAttempt(attempt: Attempt): void {
  app.attempts.push(attempt);
  if (attempt.kind === "calibration") app.cps = typingSpeed(app.attempts) ?? DEFAULT_CPS;
  appendAttempt(attempt).catch((e) => console.error("could not log attempt", e));
}

// Images inside a quiz folder.
const assetCache = new Map<string, Promise<string>>();
export function asset(dir: string, rel: string): Promise<string> {
  const key = `${dir}\u0000${rel}`;
  if (!assetCache.has(key)) assetCache.set(key, readAsset(dir, rel));
  return assetCache.get(key)!;
}

// A theme's banner image (a path like "banners/wheat.jpg").
export function banner(rel: string): Promise<string> {
  const key = `banner\u0000${rel}`;
  if (!assetCache.has(key)) assetCache.set(key, readBanner(rel));
  return assetCache.get(key)!;
}

export function dueCount(): number {
  const today = localDate(new Date());
  return entries().filter((e) => e.quiz.kind === "normal" && !e.quiz.retired && e.state.status !== "new" && isDue(e.state, today)).length;
}
