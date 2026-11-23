// Validate every series in the Watering Hole without launching the app:
//   npm run check
// Reports series folders without series.txt, format errors, quizzes outside
// their series' grid (an unknown chunk or level, two quizzes in one cell, a
// chunk with no first-level quiz), missing image files, answers or aliases
// that collide within a quiz after normalization, untagged series, article
// lines in series.txt that match no prompt or answer, and imported ids
// (library.txt in the data folder) that match no series. The data folder is
// TEMBO_DATA, else where the app keeps it on a Mac.
//
//   npm run check -- --links
// also looks up every Wikipedia link on Wikipedia, and reports titles with
// no article and titles that land on a disambiguation page. Needs network.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { assembleSeries, parseQuiz, parseSeries, type Quiz } from "../src/quiz/format";
import { normalize } from "../src/quiz/match";

const root = join(import.meta.dirname, "..", "watering-hole");
let problems = 0;
const seriesIds = new Map<string, string>();
const checkLinks = process.argv.includes("--links");
// Wikipedia title → the quizzes that link to it.
const links = new Map<string, Set<string>>();

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
    for (const title of [item.wiki, item.prompt?.wiki]) {
      if (title) links.set(title, (links.get(title) ?? new Set()).add(where));
    }
  });
}

const AGENT = { "User-Agent": "TemboQuizCheck/0.1 (https://github.com/mschachner/tembo)" };

// Looks the titles up, 50 to a request. A title may carry a section
// (`Page#Section`); only the page is checked.
async function checkWikipedia(): Promise<void> {
  const pageOf = (title: string) => title.split("#")[0].trim();
  const pages = [...new Set([...links.keys()].map(pageOf))];
  const state = new Map<string, "ok" | "missing" | "disambiguation">();
  for (let i = 0; i < pages.length; i += 50) {
    const batch = pages.slice(i, i + 50);
    const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1",
      prop: "pageprops", ppprop: "disambiguation", titles: batch.join("|"),
    });
    // Wikipedia turns away bursts of requests (429); wait and ask again.
    let res = await fetch(url, { headers: AGENT });
    for (let tries = 1; res.status === 429 && tries <= 5; tries++) {
      await new Promise((done) => setTimeout(done, 5000 * tries));
      res = await fetch(url, { headers: AGENT });
    }
    if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
    const { query } = (await res.json()) as { query: {
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
      pages: { title: string; missing?: boolean; invalid?: boolean; pageprops?: { disambiguation?: string } }[];
    } };
    const step = (pairs: { from: string; to: string }[] | undefined) => new Map((pairs ?? []).map((p) => [p.from, p.to]));
    const normalized = step(query.normalized), redirects = step(query.redirects);
    const byTitle = new Map(query.pages.map((p) => [p.title, p]));
    for (const title of batch) {
      const n = normalized.get(title) ?? title;
      const page = byTitle.get(redirects.get(n) ?? n);
      state.set(title, !page || page.missing || page.invalid ? "missing" : page.pageprops?.disambiguation !== undefined ? "disambiguation" : "ok");
    }
  }
  for (const [title, where] of links) {
    const s = state.get(pageOf(title));
    if (s === "missing") report([...where].join(", "), `no Wikipedia article "${title}"`);
    if (s === "disambiguation") report([...where].join(", "), `"${title}" is a disambiguation page on Wikipedia`);
  }
  console.log(`${links.size} Wikipedia link${links.size === 1 ? "" : "s"} looked up`);
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
  // An article line whose text is no prompt or answer of the series links
  // nothing; most likely a misspelling.
  const texts = new Set(quizzes.flatMap((q) => q.items.flatMap((it) => [it.canonical, it.prompt?.text ?? ""])));
  for (const text of meta.articles.keys()) {
    if (!texts.has(text)) report(name, `series.txt: "${text} => ..." matches no prompt or answer`);
  }
  const calibration = quizzes.some((q) => q.kind === "calibration");
  if (!series.tags.length && !calibration) report(name, "no tags (the first tag is the series' topic)");
  if (!broken) {
    const shape = `${series.chunks.length} chunk${series.chunks.length === 1 ? "" : "s"} × ${series.levels.length} level${series.levels.length === 1 ? "" : "s"}`;
    console.log(`${name}: ok (${quizzes.length} quiz${quizzes.length === 1 ? "" : "zes"}, ${shape}${calibration ? ", calibration" : ""})`);
    for (const q of quizzes) {
      const linked = q.items.filter((it) => it.wiki || it.prompt?.wiki).length;
      console.log(`  ${q.id.slice(series.id.length + 1)}: ${q.title} — ${q.items.length} items, ${q.diagram ? "diagram" : q.mode}${linked ? `, ${linked} linked` : ""}`);
    }
  }
}

const dataDir = process.env.TEMBO_DATA || join(homedir(), "Library", "Application Support", "com.mschachner.tembo", "data");
const libraryPath = join(dataDir, "library.txt");
if (existsSync(libraryPath)) {
  for (const id of readFileSync(libraryPath, "utf8").split(/\r?\n/).map((s) => s.trim())) {
    if (id && !id.startsWith("#") && !seriesIds.has(id)) report(libraryPath, `imported id "${id}" matches no series`);
  }
}

if (checkLinks) {
  try {
    await checkWikipedia();
  } catch (e) {
    report("--links", `couldn't reach Wikipedia: ${(e as Error).message}`);
  }
}

console.log(problems ? `${problems} problem(s)` : "all series ok");
process.exit(problems ? 1 : 0);
