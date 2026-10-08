// Quiz file format.
//
//   title: Countries of Africa
//   id: africa            # optional; stable key for history (default: the folder name)
//   mode: list            # "list" (type any answer) or "prompt" (each item has a prompt)
//   pass: 100             # percent required to count as a clear
//   kind: calibration     # optional; attempts measure typing speed instead of knowledge
//   retired: true         # optional; drop the quiz from the schedule
//   image-height: 72      # px, for image prompts (default 72)
//   columns: Years, Party # optional; names of per-item data columns
//   prompt-label: Order   # optional; table heading over the prompts
//   answer-label: Name    # optional; table heading over the answers
//   ---
//   Algeria
//   Côte d'Ivoire | Ivory Coast        # canonical answer, then aliases
//
// In prompt mode each line is  prompt :: answer | alias | alias
// A prompt may be an image:    ![France](flags/fr.svg) :: France
// with an optional height:     ![France](flags/fr.svg){height=120} :: France
// Image paths are relative to the quiz file. Blank lines and lines
// starting with # are ignored.
//
// Per-item data, one value per name in `columns`, follows `;;`:
//   1st :: George Washington | Washington ;; 1789–1797 ;; Unaffiliated
// It is shown alongside the prompt during play. Missing values are blank.

export type Mode = "list" | "prompt";
export type Kind = "normal" | "calibration";

export interface Prompt {
  text: string;
  image?: string;
  imageHeight?: number;  // px; overrides the quiz's image-height
}

export interface Item {
  prompt?: Prompt;
  canonical: string;
  aliases: string[];
  data: string[];        // one value per quiz column ("" where missing)
}

export interface Quiz {
  path: string;
  dir: string;         // directory holding quiz.txt and its images
  id: string;          // stable key for the attempt log
  title: string;
  mode: Mode;
  kind: Kind;
  retired: boolean;
  passPercent: number;
  imageHeight: number;   // px, default 72
  columns: string[];     // names of the per-item data columns
  promptLabel: string;   // table headings ("" for none)
  answerLabel: string;
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
  const kind = (header.kind ?? "normal") as Kind;
  if (kind !== "normal" && kind !== "calibration") {
    throw new QuizFormatError(0, `unknown kind "${header.kind}"`);
  }

  const columns = (header.columns ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  const items: Item[] = [];
  for (; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (line === "") continue;
    items.push(parseItem(line, mode, i + 1, columns.length));
  }
  if (items.length === 0) throw new QuizFormatError(lines.length, "quiz has no items");

  return {
    path,
    dir,
    id: header.id ?? dir.split("/").filter(Boolean).pop() ?? path,
    title: header.title ?? path,
    mode,
    kind,
    retired: (header.retired ?? "false").toLowerCase() === "true",
    passPercent: header.pass ? Number(header.pass) : 100,
    imageHeight: header["image-height"] ? Number(header["image-height"]) : 72,
    columns,
    promptLabel: header["prompt-label"] ?? "",
    answerLabel: header["answer-label"] ?? "",
    items,
  };
}

function parseItem(full: string, mode: Mode, lineNo: number, columnCount: number): Item {
  const [line, ...values] = full.split(";;").map((s) => s.trim());
  if (values.length > columnCount) {
    throw new QuizFormatError(lineNo, `${values.length} data values but ${columnCount} column${columnCount === 1 ? "" : "s"} in the header`);
  }
  const data = Array.from({ length: columnCount }, (_, k) => values[k] ?? "");
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

  const item: Item = { canonical: parts[0], aliases: parts.slice(1), data };
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

