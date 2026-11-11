# Tembo

    npm install
    npm run tauri dev     # desktop app, from the terminal
    npm run app           # build Tembo.app and install it in /Applications
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
`chunk:` and `level:`. Importing a series puts every chunk into rotation at
the first level; the next level of a chunk unlocks when the previous one is
proficient. Folders starting with `_` are ignored; `_backlog.md` is the daily
quiz task's queue and its standing rules.
Library: `data/library.txt`, the ids of the series imported from the
Watering Hole, one per line. The typing calibration is always included.
Attempt log: `data/attempts.jsonl`, one JSON object per line, keyed by quiz
id (`<series>/<quiz folder>`).

App icon: masters are in `art/icons/` (cream is installed). To switch,
run `npm run tauri icon art/icons/<name>.png -- -o src-tauri/icons` and
delete the `android/` and `ios/` folders it writes.
