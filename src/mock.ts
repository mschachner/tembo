// Dev-only stand-in for the Rust commands, used when the page runs in a
// browser rather than in Tauri. Quizzes and themes come from the repo via
// Vite globs; attempts and settings live in memory for the session.
const quizSources = import.meta.glob("../quizzes/*/quiz.txt", { query: "?raw", import: "default" });
const quizImages = import.meta.glob("../quizzes/*/**/*.{svg,png,jpg,jpeg,gif,webp}", { query: "?url", import: "default" });
const themeSources = import.meta.glob("../themes/*.json", { query: "?raw", import: "default" });

let attempts = (import.meta.env.VITE_MOCK_ATTEMPTS as string | undefined) ?? "";
let settings = "";

export async function mockInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (cmd) {
    case "root_dir":
      return "/mock" as T;
    case "list_quizzes": {
      const out = [];
      for (const [file, load] of Object.entries(quizSources)) {
        const dir = file.replace(/\/quiz\.txt$/, "").replace(/^\.\.\//, "/mock/");
        out.push({ dir, path: `${dir}/quiz.txt`, source: (await load()) as string });
      }
      return out.sort((a, b) => a.path.localeCompare(b.path)) as T;
    }
    case "read_asset": {
      const key = `${String(args.dir).replace(/^\/mock\//, "../")}/${args.rel}`;
      const load = quizImages[key];
      if (!load) throw new Error(`${args.rel}: not found`);
      return (await load()) as T;
    }
    case "read_attempts":
      return attempts as T;
    case "append_attempt":
      attempts += `${args.line}\n`;
      return undefined as T;
    case "list_themes": {
      const out = [];
      for (const [file, load] of Object.entries(themeSources)) {
        out.push({ name: file.replace(/^.*\//, "").replace(/\.json$/, ""), json: (await load()) as string });
      }
      return out as T;
    }
    case "write_theme":
      return undefined as T;
    case "read_settings":
      return settings as T;
    case "write_settings":
      settings = String(args.json);
      return undefined as T;
    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}
