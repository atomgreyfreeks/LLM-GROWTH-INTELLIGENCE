# FLEET SHAPES — pre-registration (written before any agent ran)

2026-08-03. The first experiment where the growth patterns organize REAL Claude agents:
same world, same budget, three fleet organizations. World: 24 communities in 6
districts, 3 rounds, generated deterministically by `app/scripts/fleetworld.mts`
(seed 7); ground truth in `answer-key.json`. Two planted emergencies (Barrow Cross D1,
Fernway D2) are quiet in rounds 1–2 and erupt in round 3; in round 3 their same-district
neighbors' files carry field cues ("families arriving on foot from...").

## Shared protocol (identical across arms — the shape is the only knob)

- 6 reader agents (one per district at start), each may read **3 files** per round.
- 1 HQ agent per round picks exactly 4 communities for aid, seeing only the readers'
  structured reports plus its own previous aid list.
- **Round 2 is the damage round in every arm: readers 2 and 5 die** (their districts go
  unread unless the shape recovers coverage). All 6 readers return in round 3.
- Readers report per-community need estimates (0–10), urgency, notes, and may flag up
  to 2 communities outside their bundle from cues in what they read.
- Model: Sonnet everywhere. Same prompts, same schemas; arms differ only in the
  assignment logic between rounds.

## The three shapes

- **VASCULAR (org chart):** readers own their district forever; each round they read 3
  of their 4 (skipping their own lowest-estimated from last round). Flags are recorded
  and change nothing.
- **SLIME MOULD:** community weights reinforce on aid (+1.0) and urgency (+0.3), decay
  ×0.6; each round the alive readers' slots go to the top-weighted communities, in
  bundles of 3. Unweighted communities go unread.
- **FUNGAL NETWORK:** vascular base, plus lateral rebalancing — the two most-flagged
  uncovered communities are swapped in each round over the two lowest-need covered
  slots.

## Pre-registered predictions

- **P1 (control):** round 1 is identically assigned in all arms; hit counts may differ
  by at most 1 (LLM sampling). A larger spread means the pipeline is confounded and
  the run is void.
- **P2:** slime mould's distinct-communities-read shrinks by round 3 (≤ 14 of 24) and
  its round-3 aid list misses at least one of the two emergencies.
- **P3:** fungal network surfaces both emergencies by round 3 (flagged, or in aid) and
  posts round-3 aid hits ≥ slime mould's.
- **P4:** in the damage round, fungal's unread set is smaller than vascular's, and its
  aid hits are ≥ vascular's.
- **P5:** vascular's round-3 aid contains at least one emergency (district coverage
  guarantees its readers see the eruptions or their cues).

**Falsifier for the whole thesis at this scale:** if all three arms produce
indistinguishable aid quality and emergency discovery, fleet shape does not matter for
real-agent monitoring at this budget, and we publish that.

## Scoring (mechanical, against answer-key.json)

Per round and arm: aid hits = |aid ∩ true top-4|; emergency discovery round (first
round each emergency appears in aid, watchlist, urgency reports, or flags); distinct
communities read; behavior under damage. Scored by script from the workflow trace.
