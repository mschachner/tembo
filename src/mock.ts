// Dev-only stand-in for the Rust commands, used when the page runs in a
// browser rather than in Tauri. Quizzes and themes come from the repo via
// Vite globs; attempts and settings live in memory for the session.
const quizSources = import.meta.glob(["../watering-hole/*/quiz.txt", "!../watering-hole/_*/**"], { query: "?raw", import: "default" });
const quizImages = import.meta.glob("../watering-hole/*/**/*.{svg,png,jpg,jpeg,gif,webp}", { query: "?url", import: "default" });
const librarySource = Object.values(import.meta.glob("../data/library.txt", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0] ?? "";
const bannerImages = import.meta.glob("../banners/*.{jpg,jpeg,png,webp}", { query: "?url", import: "default" });
const themeSources = import.meta.glob("../themes/*.json", { query: "?raw", import: "default" });
const customSources = import.meta.glob("../themes/custom/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

let attempts = (import.meta.env.VITE_MOCK_ATTEMPTS as string | undefined) ?? "";
let settings = localStorage.getItem("mock-settings") ?? "";
const deletedThemes = new Set<string>();
// Shared between preview windows through localStorage, like files on disk.
const savedThemesNow = () => new Map<string, string>([
  ...Object.entries(customSources).map(([f, json]) => [f.replace(/^.*\//, "").replace(/\.json$/, ""), json] as [string, string]),
  ...JSON.parse(localStorage.getItem("mock-themes") ?? "[]"),
]);

export async function mockInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (cmd) {
    case "sync_now":
      return undefined as T;
    case "sync_status":
      return { remote: null, last_ok: null, error: null } as T;
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
    case "open_path":
      return undefined as T;
    case "read_library":
      return (localStorage.getItem("mock-library") ?? librarySource) as T;
    case "write_library":
      localStorage.setItem("mock-library", (args.ids as string[]).map((id) => `${id}\n`).join(""));
      return undefined as T;
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
        if (!deletedThemes.has(name)) out.push({ name, json: (await load()) as string, custom: false });
      }
      for (const [name, json] of savedThemes) if (!deletedThemes.has(name)) out.push({ name, json, custom: true });
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out as T;
    }
    case "write_theme": {
      if (Object.keys(themeSources).some((f) => f.endsWith(`/${args.name}.json`))) {
        throw new Error(`${args.name} is a default preset; choose another name`);
      }
      const savedThemes = savedThemesNow();
      savedThemes.set(String(args.name), String(args.json));
      localStorage.setItem("mock-themes", JSON.stringify([...savedThemes]));
      return undefined as T;
    }
    case "delete_theme": {
      deletedThemes.add(String(args.name));
      const saved = savedThemesNow(); saved.delete(String(args.name));
      localStorage.setItem("mock-themes", JSON.stringify([...saved]));
      return undefined as T;
    }
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
