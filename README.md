# Tembo

    npm install
    npm run tauri dev     # desktop app, from the terminal
    npm run app           # build Tembo.app and install it in /Applications
    npm test              # unit tests
    npm run check         # validate every quiz file

Quizzes: one folder each under `quizzes/`, containing `quiz.txt` (format documented at the
top of `src/quiz/format.ts`) plus any images it references.
Drafts awaiting approval go in `quizzes/_drafts/` (ignored by the app).
Attempt log: `data/attempts.jsonl`, one JSON object per line.

App icon: masters are in `art/icons/` (cream is installed). To switch,
run `npm run tauri icon art/icons/<name>.png -- -o src-tauri/icons` and
delete the `android/` and `ios/` folders it writes.
