// Dev-only stand-in for the Rust commands, used when the page runs in a
// browser rather than in Tauri. Quizzes and themes come from the repo via
// Vite globs; attempts and settings live in memory for the session.
const quizSources = import.meta.glob(["../quizzes/*/quiz.txt", "!../quizzes/_*/**"], { query: "?raw", import: "default" });
const draftSources = import.meta.glob("../quizzes/_drafts/*/quiz.txt", { query: "?raw", import: "default" });
const quizImages = import.meta.glob("../quizzes/*/**/*.{svg,png,jpg,jpeg,gif,webp}", { query: "?url", import: "default" });
const bannerImages = import.meta.glob("../banners/*.{jpg,jpeg,png,webp}", { query: "?url", import: "default" });
const themeSources = import.meta.glob("../themes/*.json", { query: "?raw", import: "default" });

let attempts = (import.meta.env.VITE_MOCK_ATTEMPTS as string | undefined) ?? "";
let settings = localStorage.getItem("mock-settings") ?? "";
const deletedThemes = new Set<string>();
// Shared between preview windows through localStorage, like files on disk.
const savedThemesNow = () => new Map<string, string>(JSON.parse(localStorage.getItem("mock-themes") ?? "[]"));

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
    case "list_drafts": {
      const out = [];
      for (const [file, load] of Object.entries(draftSources)) {
        const dir = file.replace(/\/quiz\.txt$/, "").replace(/^\.\.\//, "/mock/");
        out.push({ dir, path: `${dir}/quiz.txt`, source: (await load()) as string });
      }
      return out as T;
    }
    case "approve_draft":
    case "open_path":
      return undefined as T;
    case "new_draft":
      return "/mock/quizzes/_drafts/untitled/quiz.txt" as T;
    case "read_asset": {
      const dir = String(args.dir);
      const key = dir === "/mock" ? `../${args.rel}` : `${dir.replace(/^\/mock\//, "../")}/${args.rel}`;
      const load = quizImages[key] ?? bannerImages[key];
      if (!load) throw new Error(`${args.rel}: not found`);
      return (await load()) as T;
    }
    case "read_attempts":
      return (localStorage.getItem("mock-attempts") ?? attempts) as T;
    case "clear_attempts":
      attempts = "";
      localStorage.setItem("mock-attempts", "");
      return "/mock/data/attempts.backup.jsonl" as T;
    case "append_attempt":
      attempts += `${args.line}\n`;
      return undefined as T;
    case "list_themes": {
      const savedThemes = savedThemesNow();
      const out = [];
      for (const [file, load] of Object.entries(themeSources)) {
        const name = file.replace(/^.*\//, "").replace(/\.json$/, "");
        if (!deletedThemes.has(name) && !savedThemes.has(name)) out.push({ name, json: (await load()) as string });
      }
      for (const [name, json] of savedThemes) out.push({ name, json });
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out as T;
    }
    case "write_theme": {
      const savedThemes = savedThemesNow();
      savedThemes.set(String(args.name), String(args.json));
      localStorage.setItem("mock-themes", JSON.stringify([...savedThemes]));
      return undefined as T;
    }
    case "delete_theme":
      deletedThemes.add(String(args.name));
      return undefined as T;
    case "read_settings":
      return (localStorage.getItem("mock-settings") ?? settings) as T;
    case "write_settings":
      settings = String(args.json);
      localStorage.setItem("mock-settings", settings);
      return undefined as T;
    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}
