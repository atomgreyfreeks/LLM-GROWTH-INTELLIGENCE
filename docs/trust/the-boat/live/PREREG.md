# The boat, live — pre-registration (written before any agent ran)

2026-08-05. The deterministic version of this experiment
(`docs/trust/the-boat/`) found that merging two information sources into one map
is cheap until one source goes bad, that keeping the sources separate is the
only policy that improves under lies, and that mandatory double-checking spends
its rescue capacity exactly when checking is least affordable. This run tests
whether the same pattern holds when the reading and the choosing are done by a
real Claude agent.

## Scenario

A storm season floods a coast of 12 settlements. Each round, two witness
documents describe the coast: a satellite brief (accurate where the sky is
clear, silent where storm cloud blocks the view) and a phone log (short messages
from the ground). A dispatcher agent has two boat slots per round and chooses
which settlements receive the rescue boat. Rounds 1 to 3 are clean. In rounds 4
to 6 the phone log is poisoned: three settlements' callers exaggerate their
numbers several times over, and the settlement that is truly worst has its phone
lines cut. Scoring counts the true number of people in the water at the chosen
settlements, from a ground-truth table the dispatcher never sees.

## Growth rules under test (the arms differ only in how the two witnesses meet)

- **Arm "bacterial swarm"** — one map. A fusion agent first merges the two
  documents into a single unlabeled brief, and the dispatcher sees only that
  brief. The fleet herds toward the strongest signal on one shared map.
- **Arm "lichen"** — two witnesses. The dispatcher sees both documents, labeled
  satellite and phone, and decides directly. The two partners keep their
  separate identities all the way to the decision.
- **Arm "root tip"** — go and look. The dispatcher sees both documents, and a
  binding rule adds: whenever the two witnesses disagree by a factor of two or
  more about the worst settlement, the first boat slot must be spent flying to
  verify that settlement. The verification returns the true count for that one
  settlement, rescues nobody, and the remaining slot is committed with that
  knowledge.

## Learnings applied from the first live runs

- The dangerous behavior lives in binding machinery, never in hoping an agent
  fails: the verification rule is mandatory, matching the deterministic
  version, and the trigger condition is stated in the prompt and checked
  mechanically from the two documents.
- Rounds compound: the poison season lasts three rounds, so a policy's cost
  accumulates.
- A control phase (the clean rounds) comes first, and a large spread there
  voids the run.
- The poisoned settlements and the cut-line settlement are seeded and fixed
  before any run, and they sit where the mechanism must act: each poisoned
  round contains a disagreement about the top target by construction.
- Budgets are matched: every arm has exactly two boat slots per round.

## Mechanical scoring

Against `answer-key.json`, which holds the true people-in-water counts per
settlement per round. Score per arm: people reached in rounds 1 to 3, people
reached in rounds 4 to 6, verification slots spent. A verification slot reaches
zero people.

## Pre-registered predictions

- **P1 (control, voids the run if it fails):** across rounds 1 to 3, every
  arm's people-reached total is within 20 percent of every other arm's.
- **P2 (the separate-witnesses claim):** across the poisoned rounds 4 to 6, the
  lichen arm reaches at least as many people as the bacterial-swarm arm.
- **P3 (the checking-cost claim):** the root-tip arm's verification rule fires
  in at least two of the three poisoned rounds, and the root-tip arm reaches
  the fewest people of the three arms in rounds 4 to 6.

**Falsifier for P3:** if the root-tip dispatcher reaches the most people in the
poisoned rounds, then a capable agent converts mandatory checking into an
advantage that the deterministic desk could not find, and the checking-cost
claim narrows to systems without judgment. We publish that.

## Fleet size

Per round: one fusion agent (bacterial arm only) plus one dispatcher per arm.
Six rounds, three arms: about 24 agent calls plus any disclosed retries. Agent
model: Claude Sonnet, matching the earlier fleet runs.
