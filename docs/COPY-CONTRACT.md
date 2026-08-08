# COPY CONTRACT — binding rules for all visible text in every artifact

This file binds every builder (human or agent) who writes text that a person will
see: page copy, lesson lines, overlay cards, guide prose, video captions, report
summaries. Every builder brief must cite this file. The conductor lints against it
with `app/scripts/copy-lint.mjs` before any artifact ships.

## The failure this prevents

AI-built artifacts drift into compressed, riddle-like language: invented
terminology, stacked abstract nouns, sentences that assume the reader shares
context the writer invented minutes earlier. Research circulating in August 2026
calls this "abstraction-compressed agentese." The model compresses meaning faster
than it establishes shared meaning. The fix is a measurable contract, not a vague
instruction to "be clearer."

## The rules (each one checkable)

1. **Complete sentences.** Every visible string is a complete grammatical
   sentence, except single-word labels and numeric chrome.
2. **One idea per sentence.** If a sentence contains two findings, split it.
3. **Every noun carries its context.** A sentence must be understandable in
   isolation. Never "a source went bad" — write "the phone calls became
   unreliable." Never "the pyramid that kept records" — write "the tower of
   summaries that wrote a note every time it discarded a connection."
4. **Scenario before poetry.** The first text a viewer reads states the concrete
   scenario: the place, the people, what the two sides do. A found phrase may
   FOLLOW the plain statement, never replace it.
5. **No project-internal vocabulary on screen.** Banned in visible copy: arms,
   kernel, prereg, ablation, physarum, mycelium, V-shape, H-shape, provenance,
   canonical, substrate, residue, register, chrome, telemetry, divergence.
   Organism names in plain English (SLIME MOULD, FUNGAL NETWORK, CORAL, LICHEN,
   ROOT TIP, TREE, BACTERIAL SWARM) are allowed on growth-intelligence artifacts
   and must be accompanied by what the rule does in ordinary words.
6. **No invented abbreviations or noun stacks.** Three or more abstract nouns in
   a row ("decision layer representation budget") is a defect. Rewrite as
   subject-verb-object.
7. **No contrast-statement constructions.** "Not X, but Y" and "X does not do A.
   It does B." are banned everywhere.
8. **Sentence length cap.** Any sentence over 45 words gets rewritten or split.
9. **Numbers carry their meaning.** Never a bare number: "82 km" is "82 km of
   walking wasted." State what the number counts and why it matters.
10. **Headers are sentences a newspaper would print.** No staccato fragment
    headers ("The same disaster, twice. One rule changed.").

## The test

Read each sentence alone, out of order. If a technically capable stranger would
ask "which X?" about any noun, or would need to reread, the sentence fails.

## Enforcement

- `node app/scripts/copy-lint.mjs` extracts visible strings from the experiment
  pages and the findings overlay and fails on rule 5, 7, and 8 violations
  mechanically. Rules 1–4, 6, 9, 10 are judged by the conductor reading every
  string during verification.
- Builder briefs must instruct: read this file before writing any visible text,
  and run the lint before reporting.
