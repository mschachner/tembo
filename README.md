# Tembo

    npm install
    npm run tauri dev     # desktop app, from the terminal
    npm run app           # build Tembo.app and install it in /Applications
    npm test              # unit tests
    npm run check         # validate every quiz file

The Watering Hole: every quiz, one folder each under `watering-hole/`, containing
`quiz.txt` (format documented at the top of `src/quiz/format.ts`) plus any images
it references. Folders starting with `_` are ignored; `_backlog.md` is the daily
quiz task's queue and its standing rules. Quizzes carry `tags:` (the first
tag is the topic the Library and Watering Hole can group by, with `t`), and a
harder variant of a quiz carries `after: <base-id>`: it stays hidden until the
base quiz is proficient, then joins the library on its own.
Library: `data/library.txt`, the ids of the quizzes imported from the Watering
Hole, one per line. The typing calibration quiz is always included.
Attempt log: `data/attempts.jsonl`, one JSON object per line.

App icon: masters are in `art/icons/` (cream is installed). To switch,
run `npm run tauri icon art/icons/<name>.png -- -o src-tauri/icons` and
delete the `android/` and `ios/` folders it writes.
