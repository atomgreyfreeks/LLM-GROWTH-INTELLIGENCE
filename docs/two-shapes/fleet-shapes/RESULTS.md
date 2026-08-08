# FLEET SHAPES — RESULTS

Run 2026-08-03. 57 Sonnet agents, 3 arms × 3 rounds, 6.5 minutes, zero agent errors.
Scored mechanically against `answer-key.json` (`scorecard.json` holds the full table).
The pre-registration is `PREREG.md`; verdicts below, misses first.

## Scorecard

| arm | R1 hits | R2 hits (damage) | R3 hits | round-3 emergencies in aid |
|---|---:|---:|---:|---|
| VASCULAR | 4/4 | 3/4 | 3/4 | Fernway yes · Barrow Cross no (urgent-reported, skipped) |
| SLIME MOULD | 3/4 | **4/4** | 3/4 | Fernway yes · Barrow Cross no (flagged + watchlisted, skipped) |
| FUNGAL | 4/4 | 3/4 | 3/4 | Fernway yes · Barrow Cross no (watchlisted, skipped) |

## Prediction verdicts

- **P1 (round-1 control): PASS.** Identical assignments produced 4/4, 4/4, 3/4 — the
  one-hit spread is the allowed sampling noise (that chief chose Quarry Edge over
  Millstead, both mid-tier; a defensible judgment call). Pipeline valid.
- **P2 (slime mould's coverage shrinks, misses an emergency): REFUTED as a
  shape-specific claim.** Its distinct-read never shrank (18 → 12 → 18): with 18 slots
  for 24 communities, and never-reinforced communities all decaying identically, the
  alphabetical tie-break kept both emergencies in the read set. Coverage lock-in needs
  a tighter budget and longer horizon than 3 rounds at 75% coverage — consistent with
  kernel E2, where generous budgets masked lock-in too. It did miss Barrow Cross in
  aid, but so did every arm (see finding 2), so that miss says nothing about the shape.
- **P3 / P4 (fungal advantages): VOID, by a world-design flaw that is mine.** The
  fungal arm's distinctive mechanism — flag-driven reassignment — fired zero times
  before it could matter, because the neighbor cues only exist in round-3 files and
  flag-swaps apply to the *next* round, which never comes. The inert-component rule
  applies: the arm was effectively vascular (their R2 rows are identical). Cues must
  appear as leading indicators in round 2 for this arm to be testable.
- **P5 (vascular catches an emergency by round 3): CONFIRMED** (Fernway aided).
- **Whole-thesis falsifier (all arms indistinguishable): DID NOT FIRE** — the arms
  separated in the damage round, in a direction I did not predict.

## The two findings that matter (neither was predicted)

**1. The slime-mould fleet uniquely aced the damage round.** When two officers died,
vascular and fungal lost districts 2 and 5 wholesale and dropped to 3/4 (both aided
Yarrow Point, a miss). The slime-mould fleet's weight-based reallocation moved its four
surviving officers onto the communities that had earned attention — regardless of
district lines — and scored a perfect 4/4. Reinforcement-driven rerouting is exactly
this family's documented *strength* (flow finds the important paths when structure
breaks), and the pre-registration only tested its documented weakness. With real
agents, at this budget, the strength showed up and the weakness didn't.

**2. Incumbency bias emerged at the decision desk, unprompted, in all three arms.**
Round 3's true top four includes both eruptions. Every fleet's field layer surfaced
Barrow Cross — reported urgent by a reader (vascular), flagged and watchlisted
(slime mould), watchlisted (fungal). And every chief, in all three arms, kept aiding
Millstead — the familiar, moderately-needy incumbent from rounds 1–2 — over the
newly-erupted 9.3-severity Barrow Cross. Nothing instructed this. The information
climbed; the decision layer discounted the newcomer in favor of standing. This is the
"whoever was acted on keeps the channel" failure appearing at the top of a real-agent
pipeline within one round of an eruption, and it was shape-independent. Honest scope:
one round of exposure; every chief watchlisted Barrow Cross, so a round 4 might flip
it. "Slow by at least one round" is what this run proves.

## What the next iteration changes (specified now)

1. Cut read slots to 12 of 24 (50% coverage) so exclusion is real, and run 5 rounds so
   reinforcement has a horizon.
2. Move the neighbor cues to round 2 as leading indicators, so the fungal arm's flag
   mechanism can actually fire before scoring ends.
3. Add a round 4 to measure whether HQ incumbency persists after a watchlisted
   emergency (the finding-2 follow-up: how many rounds does standing cost?).
4. Randomize community name/tie-break order per seed so alphabetical order can't
   silently protect anyone again.

## Bottom line

Fleet shape mattered where the world broke: reinforcement-organized real agents
recovered from losing a third of their fleet with a perfect aid round while both
structured arms degraded. And the most dangerous behavior in the whole run lived in
the decision layer, in every arm, without being asked for — which is the project's
thesis, measured for the first time with real agents: the pipeline's habits, not the
agents' competence, decide who gets helped.
