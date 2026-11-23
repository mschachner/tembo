# Tembo

    npm install
    npm run tauri dev     # desktop app, from the terminal
    npm run app           # build Tembo.app and install it in /Applications
    npm run release       # build Tembo.app for any Mac and zip it for a GitHub Release
    npm run fresh         # open the installed app as a first-time user sees it
    npm test              # unit tests
    npm run check         # validate every quiz file

The Watering Hole: every quiz series, one folder each under `watering-hole/`,
holding `series.txt` plus one subfolder per quiz with `quiz.txt` and any
images it references (both formats are documented at the top of
`src/quiz/format.ts`). A series is a grid: chunks (which part of the material:
A–M, N–W) by levels (how hard: standard, flipped, no clues). `series.txt`
carries the title, the `tags:` (the first tag is the topic the Library and
Watering Hole can group by, with `t`), the `levels:` in order and, when
there are several, the `chunks:` in order; each `quiz.txt` names its
`chunk:` and `level:`. Importing a series puts its first chunk into rotation at
the first level; each later chunk appears once the chunk before it has been
cleared, and the next level of a chunk unlocks when the previous one is
proficient. Folders starting with `_` are ignored; `_backlog.md` is the daily
quiz task's queue (unchecked lines ROT13-encoded, against spoilers) and its
standing rules.
Wikipedia links: a quiz's `wiki-prompt:` and `wiki-answer:` headers say which
side of each item links to Wikipedia and to which article; where a name alone
is not the article's title, a `name => title` line after `---` in the series'
`series.txt` gives it, for every quiz of the series. The links are on the
results and item screens, not during play. `npm run check -- --links` looks
every title up on Wikipedia and reports missing articles and disambiguation
pages.

Where the installed app keeps things (`src-tauri/src/paths.rs`):

- The Watering Hole is downloaded from this repository on GitHub when the
  app opens, and when its window comes back to the front (at most every
  five minutes), into
  `~/Library/Application Support/com.mschachner.tembo/watering-hole`. A new
  series pushed here shows up in every copy of the app. Until the first
  download the app reads the copy that was bundled when it was built.
- The data folder is `~/Library/Application Support/com.mschachner.tembo/data`
  (or `TEMBO_DATA`). Library: `library.txt`, the ids of the series imported
  from the Watering Hole, one per line; the typing calibration is always
  included. Attempt log: `attempts.jsonl`, one JSON object per line, keyed by
  quiz id (`<series>/<quiz folder>`). Also `settings.json`, saved presets in
  `themes/`, and your own banner images in `banners/`.
- If the data folder is a git repository with a remote, the app commits and
  pushes it after each attempt or library change and pulls it when it opens.
  Otherwise the data stays on that computer and git is never run.
- Default presets (`themes/*.json`) and banner photos (`banners/`) are
  bundled into the app.

`npm run tauri dev` (or `TEMBO_ROOT=<checkout>`) reads the Watering Hole,
presets and banners straight from the checkout and downloads nothing; the
data folder is the same one the installed app uses unless `TEMBO_DATA` says
otherwise. `npm run check` reads `library.txt` from the data folder too.
`TEMBO_HOME` replaces the whole `Application Support` folder above (data and
downloaded Watering Hole); `npm run fresh` points it at a new empty folder.

App icon: one icon, the same under every preset. Its masters are in
`art/icons/` (cream is installed). To switch, run
`npm run tauri icon art/icons/<name>.png -- -o src-tauri/icons` and delete
the `android/` and `ios/` folders it writes.
