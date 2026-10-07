# quizapp (placeholder name)

    npm install
    npm run tauri dev     # desktop app
    npm test              # parser + matcher tests

Quizzes: one folder each under `quizzes/`, containing `quiz.txt` (format documented at the
top of `src/quiz/format.ts`) plus any images it references.
Attempt log: `data/attempts.jsonl`, one JSON object per line.
