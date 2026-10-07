// Screen navigation; the functions are assigned in main.ts so views can
// link to each other without import cycles.
import type { AnyAttempt } from "./log";
import type { Quiz } from "./quiz/format";

export type Tab = "today" | "library" | "stats" | "settings";

export const nav = {
  home: (_tab?: Tab): void => {},
  quiz: (_quiz: Quiz): void => {},
  play: (_quiz: Quiz): void => {},
  attempt: (_quiz: Quiz, _attempt: AnyAttempt, _back: () => void): void => {},
  item: (_quiz: Quiz, _answer: string, _back: () => void): void => {},
};
