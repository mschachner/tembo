// Validate every series in the Watering Hole without launching the app:
//   npm run check
// Reports series folders without series.txt, format errors, quizzes outside
// their series' grid (an unknown chunk or level, two quizzes in one cell, a
// chunk with no first-level quiz), missing image files, answers or aliases
// that collide within a quiz after normalization, untagged series, and
// imported ids (data/library.txt) that match no series.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { assembleSeries, parseQuiz, parseSeries, type Quiz } from "../src/quiz/format";
import { normalize } from "../src/quiz/match";

const root = join(import.meta.dirname, "..", "watering-hole");
let problems = 0;
const seriesIds = new Map<string, string>();

function report(where: string, msg: string): void {
  problems++;
  console.log(`${where}: ${msg}`);
}

const folders = (dir: string) => readdirSync(dir).sort().filter((n) => !n.startsWith("_") && !n.startsWith(".") && statSync(join(dir, n)).isDirectory());

function checkQuiz(where: string, quiz: Quiz, dir: string): void {
  const seen = new Map<string, string>();
  quiz.items.forEach((item, i) => {
    for (const form of [item.canonical, ...item.aliases]) {
      const n = normalize(form);
      if (n === "") report(where, `item ${i + 1}: empty answer after normalization ("${form}")`);
      const prev = seen.get(n);
      if (prev !== undefined && prev !== item.canonical) {
        report(where, `item ${i + 1}: "${form}" collides with "${prev}"`);
      }
      seen.set(n, item.canonical);
    }
    if (item.prompt?.image && !existsSync(join(dir, item.prompt.image))) {
      report(where, `item ${i + 1}: image not found: ${item.prompt.image}`);
    }
  });
}

for (const name of folders(root)) {
  const dir = join(root, name);
  const path = join(dir, "series.txt");
  if (!existsSync(path)) { report(name, "no series.txt"); continue; }

  let meta;
  try {
    meta = parseSeries(readFileSync(path, "utf8"), path, dir);
  } catch (e) {
    report(name, (e as Error).message);
    continue;
  }
  if (seriesIds.has(meta.id)) report(name, `id "${meta.id}" also used by ${seriesIds.get(meta.id)}`);
  seriesIds.set(meta.id, name);

  const quizzes: Quiz[] = [];
  let broken = false;
  for (const cell of folders(dir)) {
    const where = `${name}/${cell}`;
    const quizDir = join(dir, cell);
    const quizPath = join(quizDir, "quiz.txt");
    if (!existsSync(quizPath)) { report(where, "no quiz.txt"); broken = true; continue; }
    try {
      const quiz = parseQuiz(readFileSync(quizPath, "utf8"), quizPath, quizDir, meta);
      checkQuiz(where, quiz, quizDir);
      quizzes.push(quiz);
    } catch (e) {
      report(where, (e as Error).message);
      broken = true;
    }
  }
  if (!quizzes.length) { report(name, "no quizzes"); continue; }

  let series;
  try {
    series = assembleSeries(meta, quizzes);
  } catch (e) {
    report(name, (e as Error).message.replace(`${root}/`, ""));
    continue;
  }
  const calibration = quizzes.some((q) => q.kind === "calibration");
  if (!series.tags.length && !calibration) report(name, "no tags (the first tag is the series' topic)");
  if (!broken) {
    const shape = `${series.chunks.length} chunk${series.chunks.length === 1 ? "" : "s"} × ${series.levels.length} level${series.levels.length === 1 ? "" : "s"}`;
    console.log(`${name}: ok (${quizzes.length} quiz${quizzes.length === 1 ? "" : "zes"}, ${shape}${calibration ? ", calibration" : ""})`);
    for (const q of quizzes) console.log(`  ${q.id.slice(series.id.length + 1)}: ${q.title} — ${q.items.length} items, ${q.diagram ? "diagram" : q.mode}`);
  }
}

const libraryPath = join(import.meta.dirname, "..", "data", "library.txt");
if (existsSync(libraryPath)) {
  for (const id of readFileSync(libraryPath, "utf8").split(/\r?\n/).map((s) => s.trim())) {
    if (id && !id.startsWith("#") && !seriesIds.has(id)) report("data/library.txt", `imported id "${id}" matches no series`);
  }
}

console.log(problems ? `${problems} problem(s)` : "all series ok");
process.exit(problems ? 1 : 0);
