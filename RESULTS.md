# Execution outcomes, summarized

Every experiment below is a simulated disaster, run by a fleet of AI agents,
organized by growth rules copied from living networks. Predictions were
written down before each run; scores were computed by scripts against sealed
answer keys. Refuted predictions are published beside the survivors in each
experiment's results file. To recompute the live-run scorecards from the
committed logs and keys: `cd app && node scripts/live-score.mjs` (a clean git
diff afterward is the proof).

## The deterministic experiments

| Experiment | Scale | Headline outcome | Records |
|---|---|---|---|
| The flooded region (the first test) | 64 communities, 16,299 people, 4 summary stages, 8 seeds per arm, every arm run twice byte-identically | The fungal merging rule kept all 64 communities visible to the office sending help; the standard crowding rule erased 26 while surveying stayed perfect; sending surveyors back made it worse | `docs/two-shapes/` |
| The bridge | 256 observations, 21,000 people under 8 claims, matched link budgets, 128-240 configurations run twice each | Tombstone records restored 100 percent of broken evidence trails; the strongest-support wiring restored zero, permanently; targeted hub damage is spread wiring's weak point | `docs/trust/the-bridge/` |
| The boat | 48 settlements, 18,000 people, 32 storm seasons per arm | The boat never once sailed to empty water; mandatory checking halved rescues under a poisoned channel; separate witnesses were the only desk that improved under lies | `docs/trust/the-boat/` |
| The map | 40 towns, 15,000 people, 6 crews, 300 ticks | The desk that kept turning crews around served the most people; the tidiest desks let ten emergencies expire; plan stability measured the wrong thing | `docs/trust/the-map/` |

## The live runs, with real Claude agents

| Experiment | Scale | Headline outcome | Records |
|---|---|---|---|
| The pilot | 16 agents, one pass | A capable agent with room to work protects quiet emergencies on its own; the danger lives in capacity rules, which is what every later run tightens | `docs/two-shapes/llm-pilot/` |
| The fleets | 57 agents, then 99 agents, five rounds each | At a 50 percent reading budget the slime-mould fleet went blind to half its region and missed an erupted emergency; rotation and fungal coverage both held; the fungal chief aided both emergencies before eruption | `docs/two-shapes/fleet-shapes/` |
| The bridge, live | 22 agents, two provenance rules, damage and repair | The record-keeping arm stayed perfect through damage (8 of 8 trails); the predicted single-support collapse was refuted because real summarizers carry sources in prose; the one real loss fell where prose capacity bound | `docs/trust/the-bridge/live/` |
| The boat, live | 24 agents, six storm rounds, three witness rules | Control was perfect across all arms; mandatory verification replicated its collapse exactly (131 of a possible 207 people); the fused map won because its fusion agent judged instead of averaging | `docs/trust/the-boat/live/` |
| The map, live | 22 agents, six stale-map rounds, three rerouting rules | A three-way perfect tie (5 of 5 emergencies, 1,487 people) that fired the pre-registered falsifier; the finish-the-route dispatcher legally discovered minimal commitment; one harness flaw disclosed in the results | `docs/trust/the-map/live/` |

## The standing law across all runs

Growth rules decide the outcome when the budget binds, and capable agents
rescue any structure when it does not. Where a rule truly forced the agents'
hands, the deterministic failures replicated exactly with real agents; where
any slack remained, the agents found it. The choice of organizing rule is
cheap insurance that pays out precisely when capacity is scarce — and scarce
capacity is the condition the planned large-scale runs are designed to bind.
