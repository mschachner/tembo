// Quiz files.
//
// The Watering Hole holds series: `watering-hole/<series>/series.txt`, with
// one quiz per subfolder, `watering-hole/<series>/<cell>/quiz.txt`. A series
// is a grid of quizzes along two dimensions: chunks (which part of the
// material: A–M, N–W; 1–20, 21–40) and levels (how hard: standard, reversed,
// no clues). Every chunk starts at the first level; the next level of a
// chunk unlocks when the previous one is proficient.
//
// series.txt:
//
//   title: US state capitals
//   id: us-state-capitals         # optional; stable key (default: the folder name)
//   tags: geography, capitals     # the first tag is the topic, used for grouping
//   levels: standard, reversed    # in order, easiest first (default: one level, "standard")
//   chunks: A–M, N–W              # in order (default: the chunks the quizzes name, in folder order)
//   retired: true                 # optional; drop the whole series from the schedule
//
// quiz.txt:
//
//   chunk: A–M            # one of the series' chunks (omit when the series has one chunk)
//   level: reversed       # one of the series' levels (default: the first)
//   title: US state capitals, A–M   # optional; default: series title, chunk, level
//   mode: list            # "list" (type any answer) or "prompt" (each item has a prompt)
//   pass: 100             # percent required to count as a clear
//   kind: calibration     # optional; attempts measure typing speed instead of knowledge
//   retired: true         # optional; drop this quiz from the schedule
//   image-height: 72      # px, for image prompts (default 72)
//   columns: Years, Party # optional; names of per-item data columns
//   prompt-label: Order   # optional; table heading over the prompts
//   answer-label: Name    # optional; table heading over the answers
//   layout: diagram       # optional; see "Diagrams" below
//   ---
//   Algeria
//   Côte d'Ivoire | Ivory Coast        # canonical answer, then aliases
//
// A quiz's id is `<series id>/<cell folder>`; the attempt log is keyed by
// it. Blank lines are ignored, and so is everything from a # that starts a
// line or follows a space.
//
// In prompt mode each line is  prompt :: answer | alias | alias
// A prompt may be an image:    ![France](flags/fr.svg) :: France
// with an optional height:     ![France](flags/fr.svg){height=120} :: France
// Image paths are relative to the quiz file.
//
// Per-item data, one value per name in `columns`, follows `;;`:
//   1st :: George Washington | Washington ;; 1789–1797 ;; Unaffiliated
// It is shown alongside the prompt during play. Missing values are blank.
//
// Diagrams. With `layout: diagram` the answers are nodes of a picture
// that Tembo draws, and the lines after `---` are of three kinds:
//
//   @1,0 :: add(𝒩) | add N           # a blank node at grid point (1, 0)
//   @3<30 2♯ :: G | G major           # polar: radius 3, 30° clockwise from 12 o'clock
//   given @0,0 :: ℵ₁                   # an anchor: shown filled in, not scored
//   ℵ₁ -> add(𝒩) -> add(ℳ)            # arrows between nodes
//   C -- G                            # a plain line
//
// Grid y increases upward. Text between the position and `::` is a label
// shown on the node. Edges name nodes by canonical answer (or an anchor's
// text) and need spaces around `->` and `--`. `diagram-scale: 110` sets the
// pixels per grid unit at full size. The layout works with either mode:
// in prompt mode each blank node is its own answer box, in list mode
// answers are typed in one box and land in their nodes.

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

// A node is either a blank (the item it asks for) or a given anchor.
export interface DiagramNode {
  x: number;
  y: number;             // grid units, y up
  item?: number;         // index into quiz.items
  given?: string;        // anchor text
}

export interface DiagramEdge {
  from: number;          // node indices
  to: number;
  arrow: boolean;        // false: a plain line
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  scale: number;         // px per grid unit at full size
}

export interface Quiz {
  path: string;
  dir: string;         // directory holding quiz.txt and its images
  id: string;          // stable key for the attempt log: `<series id>/<cell folder>`
  series: string;      // id of the series this quiz belongs to ("" when parsed alone)
  chunk: string;       // the series' chunk this quiz covers ("" for a series of one chunk)
  level: string;       // the series' level this quiz is at
  title: string;
  mode: Mode;
  kind: Kind;
  retired: boolean;
  tags: string[];        // the series' tags; the first is the topic ("" when untagged)
  passPercent: number;
  imageHeight: number;   // px, default 72
  columns: string[];     // names of the per-item data columns
  promptLabel: string;   // table headings ("" for none)
  answerLabel: string;
  items: Item[];
  diagram?: Diagram;     // set when `layout: diagram`
}

export class QuizFormatError extends Error {
  constructor(public line: number, message: string) {
    super(`line ${line}: ${message}`);
  }
}

const IMAGE_PROMPT = /^!\[([^\]]*)\]\(([^)]+)\)(?:\{height=(\d+)\})?$/;

// The header, as `key: value` lines, and the index of the first line after
// `---` (or past the end when there is no body).
function parseHeader(lines: string[]): { header: Record<string, string>; body: number } {
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
  return { header, body: i };
}

const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
const folderName = (dir: string, path: string) => dir.split("/").filter(Boolean).pop() ?? path;

// What series.txt says: the series and the shape of its grid. `chunks` is
// null when the file leaves them to the quizzes.
export interface SeriesMeta {
  path: string;
  dir: string;
  id: string;
  title: string;
  tags: string[];
  levels: string[];        // easiest first
  chunks: string[] | null;
  retired: boolean;
}

// A series with its quizzes: the chunks are settled and the quizzes titled.
export interface Series extends Omit<SeriesMeta, "chunks"> {
  chunks: string[];
  quizzes: Quiz[];
}

export function parseSeries(source: string, path = "", dir = ""): SeriesMeta {
  const { header } = parseHeader(source.split(/\r?\n/));
  const levels = list(header.levels);
  if (new Set(levels).size !== levels.length) throw new QuizFormatError(0, "a level is listed twice");
  const chunks = header.chunks === undefined ? null : list(header.chunks);
  if (chunks && new Set(chunks).size !== chunks.length) throw new QuizFormatError(0, "a chunk is listed twice");
  if (chunks && chunks.length === 0) throw new QuizFormatError(0, "`chunks:` names no chunks");
  return {
    path,
    dir,
    id: header.id ?? folderName(dir, path),
    title: header.title ?? folderName(dir, path),
    tags: list(header.tags).map((t) => t.toLowerCase()),
    levels: levels.length ? levels : ["standard"],
    chunks,
    retired: (header.retired ?? "false").toLowerCase() === "true",
  };
}

// A quiz's default title: the series, then the chunk when the series has
// several, then the level unless it is the first.
export function defaultTitle(series: Series, quiz: Pick<Quiz, "chunk" | "level">): string {
  const parts = [series.title];
  if (series.chunks.length > 1 && quiz.chunk) parts.push(quiz.chunk);
  if (quiz.level !== series.levels[0]) parts.push(quiz.level);
  return parts.join(", ");
}

// Puts a series together from its file and its quizzes: settles the chunk
// order, checks each quiz has a place in the grid and no two share one,
// and fills in missing titles. The quizzes stay in the order given.
export function assembleSeries(meta: SeriesMeta, quizzes: Quiz[]): Series {
  let chunks: string[];
  if (meta.chunks) {
    chunks = meta.chunks;
    for (const q of quizzes) {
      if (!chunks.includes(q.chunk)) {
        throw new Error(`${q.path}: chunk "${q.chunk || "(none)"}" is not one of the series' chunks (${chunks.join(", ")})`);
      }
    }
  } else {
    chunks = [...new Set(quizzes.map((q) => q.chunk))];
    if (chunks.length > 1 && chunks.includes("")) {
      const bare = quizzes.find((q) => q.chunk === "")!;
      throw new Error(`${bare.path}: no \`chunk:\` header, but the series has chunks (${chunks.filter(Boolean).join(", ")})`);
    }
    if (chunks.length === 0) chunks = [""];
  }
  const series: Series = { ...meta, chunks, quizzes };
  const seen = new Map<string, Quiz>();
  for (const q of quizzes) {
    const key = `${q.chunk}\u0000${q.level}`;
    const other = seen.get(key);
    if (other) throw new Error(`${q.path}: same chunk and level as ${other.path}`);
    seen.set(key, q);
    if (q.title === "") q.title = defaultTitle(series, q);
  }
  for (const chunk of chunks) {
    if (!quizzes.some((q) => q.chunk === chunk && q.level === series.levels[0])) {
      throw new Error(`${meta.path}: chunk "${chunk || "(the only one)"}" has no quiz at the first level (${series.levels[0]})`);
    }
  }
  return series;
}

// The quiz the given one builds on: the previous level of its chunk that
// has a quiz, or null at the first level.
export function previousLevel(series: Series, quiz: Quiz): Quiz | null {
  for (let k = series.levels.indexOf(quiz.level) - 1; k >= 0; k--) {
    const q = series.quizzes.find((x) => x.chunk === quiz.chunk && x.level === series.levels[k]);
    if (q) return q;
  }
  return null;
}

// Parses quiz.txt. With `series`, the quiz is placed in that series: its
// id, tags, chunk and level follow from it, and the title may be left to
// assembleSeries.
export function parseQuiz(source: string, path = "", dir = "", series?: SeriesMeta): Quiz {
  const lines = source.split(/\r?\n/);
  const { header, body } = parseHeader(lines);
  let i = body;

  const level = header.level ?? (series ? series.levels[0] : "standard");
  if (series && !series.levels.includes(level)) {
    throw new QuizFormatError(0, `level "${level}" is not one of the series' levels (${series.levels.join(", ")})`);
  }

  const mode = (header.mode ?? "list") as Mode;
  if (mode !== "list" && mode !== "prompt") {
    throw new QuizFormatError(0, `unknown mode "${header.mode}"`);
  }
  const kind = (header.kind ?? "normal") as Kind;
  if (kind !== "normal" && kind !== "calibration") {
    throw new QuizFormatError(0, `unknown kind "${header.kind}"`);
  }

  const layout = header.layout ?? "standard";
  if (layout !== "standard" && layout !== "diagram") {
    throw new QuizFormatError(0, `unknown layout "${header.layout}"`);
  }

  const columns = list(header.columns);
  const items: Item[] = [];
  let diagram: Diagram | undefined;
  if (layout === "diagram") {
    diagram = parseDiagram(lines, i, columns.length, items);
    diagram.scale = header["diagram-scale"] ? Number(header["diagram-scale"]) : 110;
  } else {
    for (; i < lines.length; i++) {
      const line = stripComment(lines[i]).trim();
      if (line === "") continue;
      items.push(parseItem(line, mode, i + 1, columns.length));
    }
  }
  if (items.length === 0) throw new QuizFormatError(lines.length, "quiz has no items");

  return {
    path,
    dir,
    id: series ? `${series.id}/${folderName(dir, path)}` : header.id ?? folderName(dir, path),
    series: series?.id ?? "",
    chunk: header.chunk ?? "",
    level,
    title: header.title ?? (series ? "" : path),
    mode,
    kind,
    retired: (header.retired ?? "false").toLowerCase() === "true" || (series?.retired ?? false),
    tags: series ? series.tags : list(header.tags).map((t) => t.toLowerCase()),
    passPercent: header.pass ? Number(header.pass) : 100,
    imageHeight: header["image-height"] ? Number(header["image-height"]) : 72,
    columns,
    promptLabel: header["prompt-label"] ?? "",
    answerLabel: header["answer-label"] ?? "",
    items,
    ...(diagram ? { diagram } : {}),
  };
}

function parseItem(line: string, mode: Mode, lineNo: number, columnCount: number): Item {
  let promptText: string | undefined;
  let rest = line;

  if (mode === "prompt") {
    const sep = line.indexOf("::");
    if (sep < 0) throw new QuizFormatError(lineNo, "prompt mode needs `prompt :: answer`");
    promptText = line.slice(0, sep).trim();
    rest = line.slice(sep + 2);
  }

  const item = parseAnswer(rest, lineNo, columnCount);
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

// `answer | alias | alias ;; data ;; data`
function parseAnswer(text: string, lineNo: number, columnCount: number): Item {
  const [answerText, ...values] = text.split(";;").map((s) => s.trim());
  if (values.length > columnCount) {
    throw new QuizFormatError(lineNo, `${values.length} data values but ${columnCount} column${columnCount === 1 ? "" : "s"} in the header`);
  }
  const data = Array.from({ length: columnCount }, (_, k) => values[k] ?? "");
  const parts = answerText.split("|").map((s) => s.trim()).filter((s) => s !== "");
  if (parts.length === 0) throw new QuizFormatError(lineNo, "empty answer");
  return { canonical: parts[0], aliases: parts.slice(1), data };
}

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
const POSITION = new RegExp(String.raw`^@\s*(${NUMBER})\s*([,<])\s*(${NUMBER})`);
const EDGE_OP = /\s+(->|--)\s+/;

// Fills `items` with the blank nodes in file order and returns the drawing.
function parseDiagram(lines: string[], start: number, columnCount: number, items: Item[]): Diagram {
  const nodes: DiagramNode[] = [];
  const byName = new Map<string, number>();
  const chains: { parts: string[]; lineNo: number }[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    const lineNo = i + 1;
    if (line === "") continue;
    const given = /^given\s+/i.exec(line);
    const rest = given ? line.slice(given[0].length) : line;

    if (rest.startsWith("@")) {
      const m = POSITION.exec(rest);
      if (!m) throw new QuizFormatError(lineNo, "expected a position, `@x,y` or `@radius<angle`");
      const a = Number(m[1]), b = Number(m[3]);
      // Polar angles run clockwise from 12 o'clock, like a clock face.
      const rad = (b * Math.PI) / 180;
      const [x, y] = m[2] === "," ? [a, b] : [round(a * Math.sin(rad)), round(a * Math.cos(rad))];
      const after = rest.slice(m[0].length);
      const sep = after.indexOf("::");
      if (sep < 0) throw new QuizFormatError(lineNo, "a node needs `@position :: answer`");
      const label = after.slice(0, sep).trim();
      let name: string;
      if (given) {
        name = after.slice(sep + 2).trim();
        if (name === "") throw new QuizFormatError(lineNo, "empty anchor");
        nodes.push({ x, y, given: name });
      } else {
        const item = parseAnswer(after.slice(sep + 2), lineNo, columnCount);
        if (label !== "") item.prompt = { text: label };
        items.push(item);
        nodes.push({ x, y, item: items.length - 1 });
        name = item.canonical;
      }
      if (byName.has(name)) throw new QuizFormatError(lineNo, `two nodes named "${name}"`);
      byName.set(name, nodes.length - 1);
    } else if (given) {
      throw new QuizFormatError(lineNo, "expected `given @position :: text`");
    } else if (EDGE_OP.test(line)) {
      chains.push({ parts: line.split(EDGE_OP).map((s) => s.trim()), lineNo });
    } else {
      throw new QuizFormatError(lineNo, "expected a node (`@x,y :: answer`) or an edge (`a -> b`, `a -- b`)");
    }
  }

  // Edges are resolved after every node is known, so they can come first.
  const edges: DiagramEdge[] = [];
  for (const { parts, lineNo } of chains) {
    const find = (name: string): number => {
      const k = byName.get(name);
      if (k === undefined) throw new QuizFormatError(lineNo, `no node named "${name}"`);
      return k;
    };
    // parts alternates name, operator, name, operator, name ...
    for (let k = 0; k + 2 < parts.length; k += 2) {
      const from = find(parts[k]), to = find(parts[k + 2]);
      if (from === to) throw new QuizFormatError(lineNo, `edge from "${parts[k]}" to itself`);
      edges.push({ from, to, arrow: parts[k + 1] === "->" });
    }
  }
  return { nodes, edges, scale: 110 };
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

// A comment starts with # at the start of a line or after whitespace, so
// answers like "F#" or "C#" survive.
function stripComment(line: string): string {
  const m = /(^|\s)#/.exec(line);
  return m ? line.slice(0, m.index) : line;
}


// A quiz's topic: its first tag, or "" when it has none.
export function topicOf(quiz: Pick<Quiz, "tags">): string {
  return quiz.tags[0] ?? "";
}
