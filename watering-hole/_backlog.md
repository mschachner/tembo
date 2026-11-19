# Quiz backlog

The daily quiz task takes the first unchecked line, builds it, and checks it
off with the date. Reorder, add or delete lines freely.

Unchecked lines are ROT13-encoded after the `- [ ] ` so Mark can't spoil the
queue by glancing at this file; checked lines are plain text. The same command
encodes and decodes: `tr 'A-Za-z' 'N-ZA-Mn-za-m'`. Decode a line before
reading or building it, encode any unchecked line you add or edit (skip notes
included), and write a line in plain text when you check it off. Never print
decoded queue lines anywhere Mark will see them: commit messages, reports or
chat.

## Standing rules for the daily task

- The Watering Hole is organized by series: `watering-hole/<series>/series.txt`
  plus one `<series>/<cell>/quiz.txt` per quiz. A series is a grid of chunks
  (parts of the material: `A–M`, `N–W`; `1–20`, `21–40`; `comedies`,
  `histories`) by levels (hardness: `standard`, then `flipped`, `no clues`,
  `list`, ...). Both file formats are documented at the top of
  `src/quiz/format.ts`; `npm run check` validates everything.
- A queue line is either a new series or a new chunk of an existing one
  ("Element symbols, 41–60" goes into `element-symbols` as chunk `41–60`;
  "Capitals of Africa, set 1" starts `capitals-of-africa` with chunk
  `set 1`). Adding a chunk means a new quiz folder with `chunk: ...` at
  the first level, and the chunk appended to `chunks:` in series.txt when
  that header is present.
- Build a new series whole: every chunk of the material, in order in
  `chunks:`, each with its harder levels, all in the same run. Tembo spaces
  the chunks out itself (a chunk appears once the chunk before it has been
  cleared), so the queue doesn't need to. Delete any later queue lines that
  are chunks of the series just built.
- Every series gets a `tags:` header in series.txt; the first tag is its
  topic and is used for grouping in the app. Reuse existing topics where one
  fits (geography, history, literature, science, mathematics, music, language,
  mythology, culture, sport, film, art) and add a narrower second tag
  (capitals, flags, shakespeare, ...). Tag the flag quizzes `geography, flags`.
- Alongside each new chunk, build at least one harder level in its own
  folder. Where the items are pairs, the harder level is `level: flipped`:
  prompts and answers trade places (capital → country). Otherwise it is
  `level: no clues` (the same prompts without the data columns) or
  `level: list` (list mode where prompt mode gave the order away). A level
  never just presents the same items in reverse order. Tembo already
  shuffles a prompt quiz once it is proficient, so no level is needed for
  random order. List the levels in order in the series' `levels:` header. Tembo hides a level until the
  previous level of that chunk is proficient, then brings it into rotation
  on its own; only series ids go in `data/library.txt`. Also look over the
  existing series once in a while and add levels to chunks that have only
  one.
- Which direction comes first: when one side of a pair is a name being
  learned (the Muses, phobias) and the other is a plain description, the
  first level shows the name and asks for the description (Clio → history),
  and the flipped level asks for the name. Producing an unfamiliar name is
  the harder direction. Likewise, when one side is already familiar (states,
  countries) and the other is what's being learned (nicknames, mottos), the
  first level shows what's being learned and asks for the familiar side
  (Hoosier State → Indiana), and the flipped level asks the reverse.
- A new level for an already-built chunk can also be queued as its own
  line ("..., flipped").
- Titration counts series, not chunks or levels: a series in `data/library.txt`
  counts as started once any of its quizzes has an attempt.
- Quiz titles are computed (series title, chunk, level); set `title:` in a
  quiz.txt only when the computed one reads badly.
- Wikipedia links: give every quiz `wiki-prompt:` and/or `wiki-answer:`
  headers ("Wikipedia links" in `src/quiz/format.ts`), so prompts and answers
  can be clicked after a quiz. Link the side that names the thing being
  learned (the Muse, not her domain; the capital, not the country; a flag
  image to `Flag of {answer}`), and both sides when both name things (work
  and creator, Greek god and Roman god, World Cup year and winning team).
  Ordinals, plain descriptions and terms with no article of their own
  (collective nouns, code words) stay unlinked. Where the header's title
  would land on the wrong article or a disambiguation page, give the article
  in series.txt, as a `text => Article title` line after a `---`; it holds
  for every quiz of the series, so a flipped level needs no lines of its
  own. Every level of a chunk links the same things. Run
  `npm run check -- --links` when the network allows: it reports
  missing articles and disambiguation pages, but not a wrong article that
  happens to exist ("Carmina Burana" is the manuscript, "Mars" the planet),
  so check what each title is about.

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
- [x] Flags of South America (prompt, images) — added 2026-11-10 as flags-of-south-america
- [x] Composers of famous works (prompt) — added 2026-11-11 as composers-of-famous-works
- [x] World Cup winners by year (prompt) — added 2026-11-12 as world-cup-winners
- [x] US state nicknames (prompt) — added 2026-11-13 as us-state-nicknames
- [x] US state nicknames, N–W (prompt) — added 2026-11-13 as us-state-nicknames/n-w
- [x] Playwright of the play (prompt) — added 2026-11-15 as playwright-of-the-play
- [x] SI base units (prompt: quantity → unit) — added 2026-11-16 as si-base-units
- [x] UK prime ministers since 1900 (prompt) — added 2026-11-17 as uk-prime-ministers
- [x] Sculptor of the sculpture (prompt) — added 2026-11-18 as sculptor-of-the-sculpture
- [x] Capitals of Africa, set 1 (prompt) — starts capitals-of-africa — added 2026-11-19 as capitals-of-africa
- [ ] Cubovnf (cebzcg)
- [ ] Pbzcbfre bs gur bcren (cebzcg)
- [ ] Bylzcvp ubfg pvgvrf, Fhzzre (cebzcg: lrne → pvgl)
- [ ] Ryrzrag flzobyf, 41–60 (cebzcg) — arj puhax bs ryrzrag-flzobyf
- [ ] Nepuvgrpg bs gur ohvyqvat (cebzcg)
- [ ] Funxrfcrner punenpgref → cynl (cebzcg) — vgf bja frevrf, abg n puhax bs funxrfcrner-cynlf
- [ ] Ybatrfg eviref (yvfg)
- [ ] Cbrg bs gur cbrz (cebzcg)
- [ ] Puvarfr mbqvnp va beqre (cebzcg)
- [ ] Ebzna rzcrebef, Whyvb-Pynhqvna gb Frirena (yvfg)
- [ ] Pbzcbfref bs snzbhf jbexf, frg 2 (cebzcg) — arj puhax bs pbzcbfref-bs-snzbhf-jbexf
- [ ] Syntf bs Rhebcr (cebzcg, vzntrf)
- [ ] Pncvgnyf bs Nfvn, frg 1 (cebzcg) — fgnegf pncvgnyf-bs-nfvn
- [ ] Pbzcbfre bs gur zhfvpny (cebzcg)
- [ ] Orfg Cvpgher jvaaref, 2000f naq 2010f (cebzcg: lrne → svyz)
- [ ] Obarf bs gur obql (yvfg)
- [ ] Frira fhzzvgf (cebzcg: pbagvarag → zbhagnva)
- [ ] Qverpgbe bs gur svyz (cebzcg)
- [ ] Pheerapvrf bs gur jbeyq, frg 1 (cebzcg)
- [ ] Ivpr cerfvqragf (cebzcg: cerfvqrag → IC)
- [ ] Nhgube bs gur abiry, frg 2 (cebzcg) — arj puhax bs nhgube-bs-gur-abiry
- [ ] Ynaqybpxrq pbhagevrf (yvfg)
- [ ] Cnvagre bs gur cnvagvat (cebzcg, vzntrf)
- [ ] Ryrzrag flzobyf, 61–86 (cebzcg) — arj puhax bs ryrzrag-flzobyf
- [ ] Pncvgnyf bs Nfvn, frg 2 (cebzcg) — arj puhax bs pncvgnyf-bs-nfvn
- [ ] AON grnzf ol pvgl (cebzcg)
- [ ] Syntf bs Nsevpn (cebzcg, vzntrf)
- [ ] Pncvgnyf bs Abegu Nzrevpn naq gur Pnevoorna (cebzcg)
- [ ] Pncvgnyf bs Bprnavn (cebzcg)
