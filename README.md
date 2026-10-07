# quizapp (placeholder name)

    npm install
    npm run tauri dev     # desktop app
    npm test              # unit tests
    npm run check         # validate every quiz file

Quizzes: one folder each under `quizzes/`, containing `quiz.txt` (format documented at the
top of `src/quiz/format.ts`) plus any images it references.
Drafts awaiting approval go in `quizzes/_drafts/` (ignored by the app).
Attempt log: `data/attempts.jsonl`, one JSON object per line.
