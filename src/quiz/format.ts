// Quiz file format.
//
//   title: Countries of Africa
//   mode: list            # "list" (type any answer) or "prompt" (each item has a prompt)
//   time: 8:00            # mm:ss, or seconds
//   pass: 100             # percent required to count as a clear
//   image-height: 72      # px, for image prompts (default 72)
//   ---
//   Algeria
//   Côte d'Ivoire | Ivory Coast        # canonical answer, then aliases
//
// In prompt mode each line is  prompt :: answer | alias | alias
// A prompt may be an image:    ![France](flags/fr.svg) :: France
// with an optional height:     ![France](flags/fr.svg){height=120} :: France
// Image paths are relative to the quiz file. Blank lines and lines
// starting with # are ignored.

export type Mode = "list" | "prompt";

export interface Prompt {
  text: string;
  image?: string;
  imageHeight?: number;  // px; overrides the quiz's image-height
}

export interface Item {
  prompt?: Prompt;
  canonical: string;
  aliases: string[];
}

export interface Quiz {
  path: string;
  dir: string;         // directory holding quiz.txt and its images
  title: string;
  mode: Mode;
  timeSeconds: number;
  passPercent: number;
  imageHeight: number;   // px, default 72
  items: Item[];
}

export class QuizFormatError extends Error {
  constructor(public line: number, message: string) {
    super(`line ${line}: ${message}`);
  }
}

const IMAGE_PROMPT = /^!\[([^\]]*)\]\(([^)]+)\)(?:\{height=(\d+)\})?$/;

export function parseQuiz(source: string, path = "", dir = ""): Quiz {
  const lines = source.split(/\r?\n/);
  const header: Record<string, string> = {};
  let i = 0;

  for (; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (line === "---") { i++; break; }
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new QuizFormatError(i + 1, "expected `key: value` in header");
    header[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }

  const mode = (header.mode ?? "list") as Mode;
  if (mode !== "list" && mode !== "prompt") {
    throw new QuizFormatError(0, `unknown mode "${header.mode}"`);
  }

  const items: Item[] = [];
  for (; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (line === "") continue;
    items.push(parseItem(line, mode, i + 1));
  }
  if (items.length === 0) throw new QuizFormatError(lines.length, "quiz has no items");

  return {
    path,
    dir,
    title: header.title ?? path,
    mode,
    timeSeconds: parseTime(header.time ?? "0"),
    passPercent: header.pass ? Number(header.pass) : 100,
    imageHeight: header["image-height"] ? Number(header["image-height"]) : 72,
    items,
  };
}

function parseItem(line: string, mode: Mode, lineNo: number): Item {
  let promptText: string | undefined;
  let answerText = line;

  if (mode === "prompt") {
    const sep = line.indexOf("::");
    if (sep < 0) throw new QuizFormatError(lineNo, "prompt mode needs `prompt :: answer`");
    promptText = line.slice(0, sep).trim();
    answerText = line.slice(sep + 2).trim();
  }

  const parts = answerText.split("|").map((s) => s.trim()).filter((s) => s !== "");
  if (parts.length === 0) throw new QuizFormatError(lineNo, "empty answer");

  const item: Item = { canonical: parts[0], aliases: parts.slice(1) };
  if (promptText !== undefined) {
    const m = IMAGE_PROMPT.exec(promptText);
    if (m) {
      item.prompt = { text: m[1], image: m[2] };
      if (m[3]) item.prompt.imageHeight = Number(m[3]);
    } else {
      item.prompt = { text: promptText };
    }
  }
  return item;
}

function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return hash < 0 ? line : line.slice(0, hash);
}

export function parseTime(s: string): number {
  const m = /^(\d+):(\d\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+$/.test(s)) return Number(s);
  throw new QuizFormatError(0, `bad time "${s}" (use mm:ss or seconds)`);
}
