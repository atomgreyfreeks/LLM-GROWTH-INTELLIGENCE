# The bridge, live — results

Run 2026-08-05. 22 Claude Sonnet agents (four engineers, one chief, and a
three-step repair audit per phase, in two arms), zero errors, about fifteen
minutes. Scored mechanically against `answer-key.json`; per-question table in
`scorecard.json`; full artifacts in `run-log.json`. Pre-registration:
`PREREG.md`, committed as `64e9f12`, pull-cap amendment as `a96a2fc`, both
before any agent ran.

## The score

Trace questions answered correctly (of eight), before and after the north
anchorage and east span findings were deleted:

| arm | control phase | damage phase | format rejections |
|---|---:|---:|---:|
| slime mould (the strongest support wins) | 8 of 8 | 7 of 8 | 0 |
| fungal network with coral records (neighbors carry the proof) | 8 of 8 | **8 of 8** | 0 |

## Verdicts against the pre-registered predictions

- **P1 (control): passed.** Both arms traced every question with the structure
  intact.
- **P2 (records enable repair, single-support collapses): REFUTED, by the
  pre-registered falsifier's exact route.** The record-keeping arm did repair
  perfectly. The single-support arm was predicted to fall to three of eight,
  and it scored seven of eight, because real summarizers route around a
  citation rule: the slime-mould engineers embedded sensor ids and the content
  of all four of their reports in the finding prose itself — one finding
  literally reads `At sensor S10... At sensor S11... At sensor S12...` — so
  the narrative carried the trail that the citation format had cut. The
  deterministic version's links were the only carrier of provenance; a
  capable agent's prose is a second, redundant carrier. This is the first
  live pilot's lesson recurring in provenance form: an eight-sentence
  allowance is a word budget, and word budgets do not force dropping.
- **P3 (failures concentrate under the deleted findings): REFUTED.** The
  single miss sat in a surviving zone. The west span engineer had spent its
  eight sentences on the zone's healthy pull-test and never mentioned the
  blocked drainage scuppers, and the repair auditor spent all eight archive
  pulls hunting the two deleted zones, leaving nothing to check the west
  span. The one real loss happened exactly where prose capacity actually
  bound — a fact that fell out of both the narrative and the citation trail
  was simply gone.

## What this run establishes

Record-keeping still won, and it was the only arm that stayed perfect through
damage. The margin, however, collapsed from the deterministic version's one
hundred percent against zero to a single question, because the live arms'
provenance was never truly confined to the links. A version two that binds —
id-free prose enforced mechanically, or three-sentence findings — is specified
by this result: the danger returns exactly when capacity or format forces the
prose to drop what the links already dropped.

## Disclosures

The repair auditor was instructed against reading files beyond its pulled
reports; the pull list itself was capped mechanically at eight, and both arms
used all eight pulls in the damage phase. No artifact violated its arm's
provenance format, so no retries were needed. The chief's claims in both arms
cited only two of the four zones, which is within the rules and mirrors how
real briefings compress.
