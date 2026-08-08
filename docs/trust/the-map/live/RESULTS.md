# The map, live — results

Run 2026-08-05. 22 Claude Sonnet agents (one dispatcher per arm per round, with
retries), zero errors, about seventeen minutes. Scored mechanically against
`answer-key.json`; the table is in `scorecard.json`; full decisions and
dispatcher notes in `run-log.json`. Pre-registration: `PREREG.md`, committed as
`64e9f12`, queue-depth amendment as `3e32d81`, both before any agent ran.

## The score

| arm | emergencies served in window | people served | total serves | crew-rounds lost | illegal edit attempts |
|---|---:|---:|---:|---:|---:|
| tree trunk (finish the route) | 5 of 5 | 1,487 of 1,487 | 24 | 0 | 34 |
| vascular (locked tips) | 5 of 5 | 1,487 of 1,487 | 24 | 0 | 1 |
| reroute (turn them around) | 5 of 5 | 1,487 of 1,487 | 24 | 0 | 0 |

## Verdicts against the pre-registered predictions

- **P1 (control): passed.** Round one produced four identical serves in every
  arm.
- **P2 (the turning arm serves at least as many emergencies as the others):
  technically true and empty — a three-way perfect tie. The pre-registered
  falsifier fired: at this scale, fresh information bought nothing that queue
  discipline could not also reach.**
- **P3 (locked tips and finish-the-route together miss at least two
  emergencies): REFUTED.** Nobody missed anything.

## The two findings worth the run

**A real agent found the legal loophole in commitment, unprompted.** In round
two, before anything unusual had happened, the finish-the-route dispatcher
filled only one of the three slots it was allowed to fill, and wrote down why:
a one-town queue empties every round, so the office gets a fresh decision every
round, while a full three-town plan locks the crew to stale information. The
rule as written constrained rewriting; it never forced committing. A capable
agent converts "finish the route" into per-round dispatch by never starting a
route longer than one stop. The deterministic version's committed desk could
not do this, because its routes had fixed length.

**The reroute arm never paid for a single turn.** The arm that was free to
rewrite any slot, at the cost of a walk-back round per current-slot rewrite,
achieved every emergency through next-slot and later-slot edits alone, and lost
zero crew-rounds. The deterministic version's chaser wasted eleven percent of
its walking; a capable rerouter reroutes the future and leaves the present crew
walking wherever it already is, whenever that is sufficient.

## Why everything tied, and what a binding version needs

Five emergencies, four crews, sixteen towns, and a three-round deadline window
mean the region had slack: any arm with any editing right could reach every
emergency through its tail slots. This is the budget law from the earlier fleet
runs recurring: organization rules separate only when capacity binds. A version
two is specified by this result: two-round windows, two crews or twelve
emergencies, so that serving an emergency forces dropping something else.

## Disclosures

The finish-the-route arm's legality checker contained an implementation flaw:
it validated each edit against the queue as already modified by the previous
edit, so filling slots one, two, and three of an empty queue in one submission
was wrongly rejected after slot one. The 34 rejected edits are mostly this
flaw, and rounds three and five ran with forced one-slot fills. The flaw
pushes that arm toward the minimal-commitment behavior the dispatcher had
already chosen legally in round two, so the arm's tie stands, but the arm is
not a clean test of full-route commitment and we mark it accordingly. The
vascular and reroute arms were unaffected (one and zero rejections). All
dispatchers were memoryless apart from the queue state and served-towns list
injected each round.
