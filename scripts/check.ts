// Validate every quiz in the Watering Hole without launching the app:
//   npm run check
// Reports format errors, missing image files, duplicate ids, and answers
// or aliases that collide within a quiz after normalization, and imported
// ids (data/library.txt) that match no quiz.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseQuiz } from "../src/quiz/format";
import { normalize } from "../src/quiz/match";

const root = join(import.meta.dirname, "..", "watering-hole");
let problems = 0;
const ids = new Map<string, string>();

function report(where: string, msg: string): void {
  problems++;
  console.log(`${where}: ${msg}`);
}

for (const name of readdirSync(root).sort()) {
  const dir = join(root, name);
  if (name.startsWith("_") || !statSync(dir).isDirectory()) continue;
  const path = join(dir, "quiz.txt");
  if (!existsSync(path)) { report(name, "no quiz.txt"); continue; }

  let quiz;
  try {
    quiz = parseQuiz(readFileSync(path, "utf8"), path, dir);
  } catch (e) {
    report(name, (e as Error).message);
    continue;
  }

  if (ids.has(quiz.id)) report(name, `id "${quiz.id}" also used by ${ids.get(quiz.id)}`);
  ids.set(quiz.id, name);

  const seen = new Map<string, string>();
  quiz.items.forEach((item, i) => {
    for (const form of [item.canonical, ...item.aliases]) {
      const n = normalize(form);
      if (n === "") report(name, `item ${i + 1}: empty answer after normalization ("${form}")`);
      const prev = seen.get(n);
      if (prev !== undefined && prev !== item.canonical) {
        report(name, `item ${i + 1}: "${form}" collides with "${prev}"`);
      }
      seen.set(n, item.canonical);
    }
    if (item.prompt?.image && !existsSync(join(dir, item.prompt.image))) {
      report(name, `item ${i + 1}: image not found: ${item.prompt.image}`);
    }
  });
  console.log(`${name}: ok (${quiz.items.length} items, ${quiz.mode}${quiz.diagram ? " diagram" : ""}${quiz.kind === "calibration" ? ", calibration" : ""})`);
}

const libraryPath = join(import.meta.dirname, "..", "data", "library.txt");
if (existsSync(libraryPath)) {
  for (const id of readFileSync(libraryPath, "utf8").split(/\r?\n/).map((s) => s.trim())) {
    if (id && !id.startsWith("#") && !ids.has(id)) report("data/library.txt", `imported id "${id}" matches no quiz`);
  }
}

console.log(problems ? `${problems} problem(s)` : "all quizzes ok");
process.exit(problems ? 1 : 0);
