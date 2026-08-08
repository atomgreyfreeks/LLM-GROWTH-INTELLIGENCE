# AURAWORLD

We build simulated disasters — a flooded survey region, a storm coast with
conflicting witnesses, an aging bridge under sensor surveillance, a rescue
region with deadline emergencies — and hand the rescue work to fleets of AI
agents. Each fleet is organized the way a living network grows: slime mould,
fungal network, lichen, coral, root tip, vascular, bacterial swarm, tendril.
The organizing rule is enforced mechanically by the harness, the agents do all
of the reading and judging, and scripts score every run against a sealed
answer key. The question the whole project tests: does the choice of growth
rule change who a fleet of AI agents can see, prove, and save?

The finding so far, from deterministic simulations plus 240 real Claude
agents: yes, and the effect concentrates where capacity binds. The
fungal-network family (spread connections, merge instead of ranking, record
what you discard) has won or tied every experiment. The slime-mould family
(feed attention to recent results) went blind at a tight budget. Mandatory
verification (the root-tip rule as a hard mandate) cost a real dispatcher a
third of its rescues. Ten of fourteen of our own pre-registered predictions
were refuted, and the refutations are published beside the survivors.

## Read first

Start the app (below) and open `http://127.0.0.1:5273/` — it opens the
overview, which states the findings, the honest boundaries around them, and
the scale-up plan in plain language. The menu at the top right of every page
reaches everything else.

## Run the pages

Requires Node 20.19 or newer (the build tooling will not start on Node 18 or
below). Verified on Node 22.

```bash
cd app
npm install
npx vite --host 127.0.0.1 --port 5273 --strictPort
```

| Page | What it is |
|---|---|
| `/guide/overview.html` | The whole project in plain words: findings first |
| `/guide/growth.html` | The complete guide: every experiment, every growth rule, live figures |
| `/guide/live.html` | The live runs: three disasters run by real Claude agent fleets |
| `/guide/GUIDE.html` | The plain guide to the first experiment |
| `/twoshapes.html` | The first experiment as a live instrument: a flooded region, summarized four times |
| `/?scene=the-strata` | The same loss as five layers you can orbit |
| `/?scene=the-strata-plain` | The same scene with its text in plain words |
| `/strata.html` | The five layers, warm variant |
| `/bridge.html` | The bridge instrument: can a conclusion still show its proof? |
| `/boat.html` | The storm coast instrument: which witness do you believe? |
| `/mapworld.html` | The deadline region instrument: do you turn the crews around? |
| `/mvp.html` | Supplemental: eight growth models growing over one territory |

On every instrument page: space pauses, `L` opens a frame-time meter, and the
button labeled "what we learned" opens the findings.

## Re-run the simulations

Each script runs its world twice and aborts unless the two event logs are
byte-identical:

```bash
cd app
npx tsx scripts/twoshapes.mts
npx tsx scripts/bridge.mts
npx tsx scripts/boat.mts
npx tsx scripts/mapworld.mts
```

The world generators for the live agent runs are `scripts/live-bridge.mts`,
`scripts/live-boat.mts`, and `scripts/live-map.mts`; the fleet worlds came
from `scripts/fleetworld.mts` and `scripts/fleetworld2.mts`. To check every
visible sentence on the guide pages against the writing rules in
`docs/COPY-CONTRACT.md`:

```bash
node scripts/copy-lint.mjs
```

To recompute the live-run scorecards from the committed run logs and sealed
answer keys (a clean git diff afterward proves the committed scores are
exactly what the logs produce):

```bash
node scripts/live-score.mjs
```

## The experiment records

Every experiment folder holds the full paper trail: the pre-registration
written before any run, the results with honest verdicts, and — for the
experiments with a plain-language telling — a `WHAT-HAPPENED.md` anyone can
read.

| Path | What it holds |
|---|---|
| `docs/two-shapes/` | The first experiment series: design, results, the 16-agent pilot, and the 57- and 99-agent fleet runs with worlds, answer keys, and scorecards |
| `docs/trust/the-bridge/` | The bridge experiment: scripted version plus the live 22-agent run under `live/` |
| `docs/trust/the-boat/` | The storm coast experiment: scripted version plus the live 24-agent run under `live/` |
| `docs/trust/the-map/` | The deadline region experiment: scripted version plus the live 22-agent run under `live/` |
| `docs/3090-READINESS.md` | The scale-up engineering: pointing the same kernels at real local models changes one function |
| `docs/COPY-CONTRACT.md` | The writing rules every visible sentence must pass |

Each `live/` folder contains the pre-registration, the generated world files,
the sealed `answer-key.json`, the full `run-log.json` of agent outputs, the
mechanical `scorecard.json`, and the results with verdicts against every
prediction.

## Reproducibility, stated plainly

No simulation uses wall-clock time or unseeded randomness; the same seed
produces byte-identical event logs, asserted on every run. The visual pages
replay committed logs and never re-run simulation logic, so what you watch is
exactly what was scored. Budgets are matched across compared conditions and
asserted in code. Live-agent runs enforce the organizing rules mechanically in
the harness; agents only read, judge, and choose; scoring is a script against
an answer key fixed before the run.

Provenance is not asserted here, it is regenerated. Every world file and every
sealed answer key is a pure function of a committed seed, so no key could have
been shaped to fit a result after the fact. Check it directly:

```bash
cd app
npx tsx scripts/live-map.mts
npx tsx scripts/live-boat.mts
npx tsx scripts/live-bridge.mts
npx tsx scripts/fleetworld.mts
npx tsx scripts/fleetworld2.mts
node scripts/live-score.mjs
git diff --exit-code
```

A clean diff proves two things at once: no answer key was bent toward an
outcome, because every key rebuilds from its seed; and no score was entered by
hand, because every scorecard rebuilds from the run logs and the keys.
`run-log.json` is the only artifact that cannot be regenerated — it is the
agents' real output, which is the thing being measured.

The limit of that proof, stated plainly: it establishes that the answer keys
were fixed independently of the results, not that the prose predictions in each
`PREREG.md` were written before their run. This repository is a curated copy of
a larger development repository, and the results files cite commit hashes from
it (`64e9f12`, `a96a2fc`, `3e32d81`), but that history is not part of this
repository and the commit dates here do not carry it.

## License

MIT — see `LICENSE`. No real persons are modeled anywhere; every settlement,
town, and person in these worlds is synthetic.
