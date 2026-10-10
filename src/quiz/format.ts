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
//   layout: diagram       # optional; see "Diagrams" below
//   ---
//   Algeria
//   Côte d'Ivoire | Ivory Coast        # canonical answer, then aliases
//
// In prompt mode each line is  prompt :: answer | alias | alias
// A prompt may be an image:    ![France](flags/fr.svg) :: France
// with an optional height:     ![France](flags/fr.svg){height=120} :: France
// Image paths are relative to the quiz file. Blank lines are ignored, and
// so is everything from a # that starts a line or follows a space.
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
  diagram?: Diagram;     // set when `layout: diagram`
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

  const layout = header.layout ?? "standard";
  if (layout !== "standard" && layout !== "diagram") {
    throw new QuizFormatError(0, `unknown layout "${header.layout}"`);
  }

  const columns = (header.columns ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
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

