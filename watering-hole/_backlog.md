# Quiz backlog

The daily quiz task takes the first unchecked line, builds it, and checks it
off with the date. Reorder, add or delete lines freely.

## Standing rules for the daily task

- The Watering Hole is organized by series: `watering-hole/<series>/series.txt`
  plus one `<series>/<cell>/quiz.txt` per quiz. A series is a grid of chunks
  (parts of the material: `A–M`, `N–W`; `1–20`, `21–40`; `comedies`,
  `histories`) by levels (hardness: `standard`, then `reversed`, `no clues`,
  `list`, ...). Both file formats are documented at the top of
  `src/quiz/format.ts`; `npm run check` validates everything.
- A queue line is either a new series or a new chunk of an existing one
  ("Element symbols, 41–60" goes into `element-symbols` as chunk `41–60`;
  "Capitals of Africa, set 1" starts `capitals-of-africa` with chunk
  `set 1`). Adding a chunk means a new quiz folder with `chunk: ...` at
  the first level, and the chunk appended to `chunks:` in series.txt when
  that header is present.
- Every series gets a `tags:` header in series.txt; the first tag is its
  topic and is used for grouping in the app. Reuse existing topics where one
  fits (geography, history, literature, science, mathematics, music, language,
  mythology, culture, sport, film, art) and add a narrower second tag
  (capitals, flags, shakespeare, ...). Tag the flag quizzes `geography, flags`.
- Alongside each new chunk, build at least one harder level in its own
  folder (`level: reversed`, `level: no clues`, `level: list`): the other
  direction (capital → country), the same prompts without the data columns,
  or list mode where prompt mode gave the order away. List the levels in
  order in the series' `levels:` header. Tembo hides a level until the
  previous level of that chunk is proficient, then brings it into rotation
  on its own; only series ids go in `data/library.txt`. Also look over the
  existing series once in a while and add levels to chunks that have only
  one.
- A new level for an already-built chunk can also be queued as its own
  line ("..., reversed").
- Quiz titles are computed (series title, chunk, level); set `title:` in a
  quiz.txt only when the computed one reads badly.

## Queue

- [x] US presidents in order, 1–24 (prompt: "16th" → Lincoln) — added 2026-10-08 as us-presidents-1-24
- [x] US presidents in order, 25–47 (prompt) — added 2026-10-08 as us-presidents-25-47
- [x] Element symbols, 1–20 (prompt: symbol → element) — added 2026-10-09 as element-symbols-1-20
- [x] Capitals of South America (prompt) — added 2026-10-10 as capitals-of-south-america
- [x] Shakespeare's plays (list) — added 2026-10-12 as shakespeare-comedies
- [x] Shakespeare's histories, First Folio (list) — added 2026-10-14 as shakespeare-histories
- [x] Shakespeare's tragedies, First Folio (list) — added 2026-10-15 as shakespeare-tragedies
- [x] Greek gods → Roman names (prompt) — added 2026-10-16 as greek-gods-roman-names
- [x] NATO phonetic alphabet (list) — added 2026-10-20 as nato-phonetic-alphabet
- [x] US state capitals A–M (prompt) — added 2026-10-21 as us-state-capitals-a-m
- [x] Seven Wonders of the Ancient World (list) — added 2026-10-23 as seven-wonders-ancient-world
- [x] Planets and their largest moons (prompt) — added 2026-10-24 as planets-largest-moons
- [x] Wives of Henry VIII (prompt: order → name) — added 2026-10-26 as wives-of-henry-viii
- [x] Planets and their largest moons, reversed (prompt: moon → planet), after planets-largest-moons — added 2026-10-27 as planets-largest-moons-reversed
- [x] Author of the novel, set 1 (prompt) — added 2026-10-28 as author-of-the-novel-1
- [x] US state capitals N–W (prompt) — added 2026-10-30 as us-state-capitals-n-w
- [x] Element symbols, 21–40 (prompt) — added 2026-10-31 as element-symbols-21-40
- [x] Muses and their domains (prompt) — added 2026-11-01 as muses-and-their-domains
- [x] Wedding anniversary gifts (prompt: "25th" → Silver) — added 2026-11-02 as wedding-anniversary-gifts
- [x] Capitals of Europe (prompt) — added 2026-11-03 as capitals-of-europe-a-l
- [x] Capitals of Europe, M–Z (prompt) — added 2026-11-04 as capitals-of-europe-m-z
- [x] Greek alphabet (list) — added 2026-11-05 as greek-alphabet
- [x] NATO phonetic alphabet, reversed (prompt: letter → word), after nato-phonetic-alphabet — added 2026-11-06 as nato-phonetic-alphabet-reversed
- [x] English/British monarchs since 1066 (prompt) — added 2026-11-07 as english-monarchs-1066-1485
- [x] English/British monarchs, 1485–present (prompt) — added 2026-11-08 as english-british-monarchs-1485-present
- [x] Animal group names (prompt: "a murder of" → crows) — added 2026-11-09 as animal-group-names
- [ ] Flags of South America (prompt, images)
- [ ] Composers of famous works (prompt)
- [ ] World Cup winners by year (prompt)
- [ ] US state nicknames (prompt)
- [ ] SI base units (prompt: quantity → unit)
- [ ] UK prime ministers since 1900 (prompt)
- [ ] Capitals of Africa, set 1 (prompt) — starts capitals-of-africa
- [ ] Phobias (prompt)
- [ ] Olympic host cities, Summer (prompt: year → city)
- [ ] Element symbols, 41–60 (prompt) — new chunk of element-symbols
- [ ] Shakespeare characters → play (prompt) — its own series, not a chunk of shakespeare-plays
- [ ] Longest rivers (list)
- [ ] Chinese zodiac in order (prompt)
- [ ] Roman emperors, Julio-Claudian to Severan (list)
- [ ] Flags of Europe (prompt, images)
- [ ] Capitals of Asia, set 1 (prompt) — starts capitals-of-asia
- [ ] Best Picture winners, 2000s and 2010s (prompt: year → film)
- [ ] Bones of the body (list)
- [ ] Seven summits (prompt: continent → mountain)
- [ ] Currencies of the world, set 1 (prompt)
- [ ] Vice presidents (prompt: president → VP)
- [ ] Author of the novel, set 2 (prompt) — new chunk of author-of-the-novel
- [ ] Capitals of Africa, set 2 (prompt) — new chunk of capitals-of-africa
- [ ] Landlocked countries (list)
- [ ] Painter of the painting (prompt, images)
- [ ] Element symbols, 61–86 (prompt) — new chunk of element-symbols
- [ ] Capitals of Asia, set 2 (prompt) — new chunk of capitals-of-asia
- [ ] NBA teams by city (prompt)
- [ ] Flags of Africa (prompt, images)
- [ ] Capitals of North America and the Caribbean (prompt)
- [ ] Capitals of Oceania (prompt)
