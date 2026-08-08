# The map, live — pre-registration (written before any agent ran)

2026-08-05. The deterministic version of this experiment
(`docs/trust/the-map/`) found that a dispatch office which turns its crews
around whenever fresh information arrives serves the most people, and that an
office optimizing for a tidy, stable plan lets emergencies expire inside their
deadlines. This run tests whether the same pattern holds when the dispatcher is
a real Claude agent reading prose briefings.

## Scenario

A rural region has 16 towns and 4 rescue crews. The run lasts 6 rounds. Serving
a town takes a crew one round. Each round the dispatcher receives a prose
briefing describing every town — routine needs, complaints, and, when they
occur, emergencies with stated deadlines. The briefing is always one round
stale: in round n it describes the world as it stood in round n minus one.
Five emergencies appear during the run on a seeded schedule; each expires three
rounds after it appears. Emergencies are only ever visible one round after they
appear, so the reachable window is tight by construction.

## Growth rules under test (the arms differ only in the rerouting rule)

Every crew holds a queue of three towns: the town it is serving now, the town
it goes to next, and a later stop. The dispatcher edits queues each round under
its arm's rule.

- **Arm "tree trunk"** — finish the route. A crew's queue may only be rewritten
  when it empties, so plans complete once started. The trunk grows where it was
  pointed.
- **Arm "vascular"** — locked tips. The town a crew is serving now and the town
  it goes to next both stay locked; only the later stop may be edited. The
  growing tip never turns.
- **Arm "reroute"** — turn them around. Any queue slot may be rewritten each
  round. Rewriting a crew's current slot costs the walk back: that crew serves
  nothing this round and reaches the new town next round.

**Amendment, 2026-08-05, before any agent ran.** The first draft gave each crew
a queue of two towns and locked only the current slot in the vascular arm.
Under that draft the vascular arm could insert an emergency into any crew's
next slot, which gives it exactly the reroute arm's best timing with none of
the walk-back cost, so the two arms could never differ and the design could
not express the failure the deterministic version found. Queues are now three
slots, and the vascular arm locks the first two. The initial queues are
staggered in length (one, two, three, three) so the tree-trunk arm's rewrite
windows spread across rounds.

## Learnings applied from the first live runs

- The rule is binding machinery: the runner enforces each arm's editing rights
  mechanically and rejects an illegal edit once with the rule restated; every
  rejection is disclosed.
- A control round comes first: round 1 contains no emergencies, and all three
  arms receive identical briefings, so their service counts must tie.
- The emergency schedule is seeded and fixed before any run, and it is placed
  where the mechanisms must differ: three of the five emergencies strike towns
  that no crew's current queue points at when they become visible.
- Rounds compound: five emergencies across four appearance rounds, so one
  lucky catch cannot decide the result.
- Budgets are matched: every arm has the same four crews, the same briefings,
  and the same walk-back cost when a current slot is rewritten.

## Mechanical scoring

Against `answer-key.json`, which holds the emergency schedule, deadlines, and
per-town service values. Score per arm: emergencies served inside their
deadline (of five), people served in emergencies, routine town-service count,
crew-rounds lost to walk-backs.

## Pre-registered predictions

- **P1 (control, voids the run if it fails):** round 1 service counts are
  identical across arms.
- **P2 (the turning claim):** the reroute arm serves at least as many
  emergencies inside their deadlines as each other arm, despite paying
  walk-back rounds.
- **P3 (the tidy-plan cost):** the vascular arm and the tree-trunk arm
  together miss at least two emergencies that the reroute arm serves.

**Falsifier:** if the tree-trunk arm ties the reroute arm on emergencies
served, then fresh information is worthless at this scale and queue discipline
is free, which contradicts the deterministic version. We publish that.

## Fleet size

One dispatcher agent per arm per round: 18 agent calls plus any disclosed
retries. Crews are mechanical. Agent model: Claude Sonnet, matching the earlier
fleet runs.
