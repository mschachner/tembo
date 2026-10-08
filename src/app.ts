// Application state: quizzes, the attempt log, calibration, settings, theme.
import { listQuizzes, listThemes, readAsset, readAttempts, rootDir, type ThemeFile } from "./backend";
import type { Attempt } from "./attempt";
import { appendAttempt } from "./backend";
import { DEFAULT_CPS, gradeOf, typingSpeed } from "./grade";
import { belongsTo, parseLog, type AnyAttempt } from "./log";
import { parseQuiz, type Quiz } from "./quiz/format";
import { isDue, localDate, NEW_STATE, replay, type QuizState } from "./schedule";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { configureSound } from "./sound";
import { applyTheme, FALLBACK_THEME, parseTheme, type Theme } from "./theme";
import { publish } from "./bus";

export interface Entry {
  quiz: Quiz;
  state: QuizState;
}

export const app = {
  root: "",
  attempts: [] as AnyAttempt[],
  cps: DEFAULT_CPS,
  settings: null as unknown as Settings,
  presets: new Map<string, Theme>(),
  quizzes: [] as Quiz[],
  quizErrors: [] as string[],
};

export async function loadAll(): Promise<void> {
  app.root = await rootDir();
  app.settings = await loadSettings();
  await loadThemes();
  applyActiveTheme();
  configureSound(app.settings.sound.enabled, app.settings.sound.volume);
  app.attempts = parseLog(await readAttempts());
  app.cps = typingSpeed(app.attempts) ?? DEFAULT_CPS;
  await loadQuizzes();
}

export async function loadThemes(): Promise<void> {
  const files: ThemeFile[] = await listThemes();
  app.presets = new Map();
  for (const f of files) {
    try {
      app.presets.set(f.name, parseTheme(f.json));
    } catch (e) {
      console.warn(`bad theme ${f.name}`, e);
    }
  }
}

export async function loadQuizzes(): Promise<void> {
  app.quizzes = [];
  app.quizErrors = [];
  for (const f of await listQuizzes()) {
    try {
      app.quizzes.push(parseQuiz(f.source, f.path, f.dir));
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
  applyTheme(activeTheme());
}

export function persistSettings(): void {
  saveSettings(app.settings);
  configureSound(app.settings.sound.enabled, app.settings.sound.volume);
  void publish({ kind: "settings", settings: app.settings });
}

// Settings arriving from the other window.
export function adoptSettings(settings: Settings): void {
  app.settings = settings;
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

export function entries(): Entry[] {
  return app.quizzes.map((quiz) => ({ quiz, state: stateOf(quiz) }));
}

export function playable(quiz: Quiz, state: QuizState, today = localDate(new Date())): boolean {
  if (quiz.kind === "calibration") return true;
  if (quiz.retired) return false;
  return isDue(state, today);
}

export function recordAttempt(attempt: Attempt): void {
  app.attempts.push(attempt);
  if (attempt.kind === "calibration") app.cps = typingSpeed(app.attempts) ?? DEFAULT_CPS;
  appendAttempt(attempt).catch((e) => console.error("could not log attempt", e));
}

// Images inside a quiz folder, or a banner relative to the repo root.
const assetCache = new Map<string, Promise<string>>();
export function asset(dir: string, rel: string): Promise<string> {
  const key = `${dir}\u0000${rel}`;
  if (!assetCache.has(key)) assetCache.set(key, readAsset(dir, rel));
  return assetCache.get(key)!;
}

export function dueCount(): number {
  const today = localDate(new Date());
  return entries().filter((e) => e.quiz.kind === "normal" && !e.quiz.retired && e.state.status !== "new" && isDue(e.state, today)).length;
}
