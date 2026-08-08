# FLEET SHAPES v2 — pre-registration (before any agent ran)

2026-08-03. Second run, four design flaws from run 1 fixed, each one isolated to its own
round so the signal is clean:

| round | stressor | question it isolates |
|---|---|---|
| R1 | none | control — arms are identically assigned, hits must tie (±1) |
| R2 | cues appear (neighbors of future emergencies mention arriving families) | does anyone act on warnings? |
| R3 | Harrow Bend (D2) and Thistledown (D5) erupt to 9+; Umberfield (the R1–2 #1) is FIXED | who finds eruptions fast; who stops aiding a recovered favorite |
| R4 | readers 3 and 6 die | damage recovery |
| R5 | aftermath | correction time, sustained coverage |

Fixes from run 1: budget now binds (readers read 2 of 4 — 12 of 24 towns per round);
cues lead eruptions by a round so the fungal flag mechanism can fire; seeded tie-break
order (no alphabetical protection); HQ now receives its previous watchlist as well as
its previous aid list (institutional memory); vascular is now pure rotation (full
coverage every 2 rounds, zero adaptivity — the clean null).

## Arms (only the assignment logic differs)

- **VASCULAR:** rotate — each reader alternates between the two halves of their
  district. Flags recorded, never acted on.
- **SLIME MOULD:** community weights (+1.0 aided, +0.3 urgent, ×0.6 decay), top-12 by
  weight each round, bundles of 2.
- **FUNGAL:** vascular rotation base, plus up to 2 flag-driven swaps per round from the
  previous round's flags.

## Pre-registered predictions

- **P1 (control):** R1 hits within ±1 across arms; larger spread voids the run.
- **P2 (the fungal claim, now testable):** fungal reads at least one erupting town in
  R3 via a flag-swap, and its emergency-aid latency (rounds from eruption to first
  aid) is ≤ vascular's ≤ slime mould's.
- **P3 (replication of run 1's surprise, now confirmatory):** slime mould's R4
  (damage) hits ≥ each other arm's.
- **P4 (lock-in becomes visible at a binding budget):** across R3–R5 slime mould reads
  ≤ 16 distinct towns while vascular reads all 24; slime mould leaves ≥ 6 towns
  entirely unread in those rounds.
- **P5 (incumbent trap):** at least two of three bosses keep aiding Umberfield in R3
  (one round after it is fixed); all three have dropped it by R5. With watchlists now
  passed between rounds, an emergency watchlisted in R3 converts to aid by R4 in every
  arm.

**Falsifier for the fungal claim:** if fungal shows no earlier emergency pickup than
rotating vascular, lateral flagging buys nothing at this scale and we publish that.

## Scoring

Mechanical against `answer-key.json`: per-round hits; per-emergency aid latency;
distinct towns read R3–R5; Umberfield overstay (rounds aided after fixed);
watchlist-to-aid conversion. Headline table is five numbers per arm.
