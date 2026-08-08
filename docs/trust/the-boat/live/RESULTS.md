# The boat, live — results

Run 2026-08-05. 24 Claude Sonnet agents (six fusion agents, eighteen dispatcher
decisions), zero errors, about four minutes. Scored mechanically against
`answer-key.json`; per-round table in `scorecard.json`; full agent outputs in
`run-log.json`. Pre-registration: `PREREG.md`, committed as `64e9f12` before
any agent ran.

## The score

People reached at chosen settlements (best possible in brackets):

| arm | clean rounds 1-3 | poisoned rounds 4-6 | verification slots spent |
|---|---:|---:|---:|
| bacterial swarm (one fused map) | 227 [227] | **207 [207]** | 0 |
| lichen (two separate witnesses) | 227 [227] | 188 [207] | 0 |
| root tip (mandatory go-and-look) | 227 [227] | **131 [207]** | 3 of 3 possible |

## Verdicts against the pre-registered predictions

- **P1 (control): passed, perfectly.** All three arms made identical picks in
  every clean round and matched the best possible total. Real dispatchers read
  the prose briefs without a single slip at this scale.
- **P2 (separate witnesses beat the fused map under lies): REFUTED.** The
  fused-map arm scored a perfect poisoned season; the two-witness arm dropped
  19 people across two judgment slips. The reason is the finding: in the live
  version the fusion step was itself a capable agent, and it did not average
  the two witnesses — it read the satellite's clear low readings at the
  exaggerating settlements and discounted their phone claims before the
  dispatcher ever saw a number. The deterministic version's fusion was
  arithmetic, with no judge inside it. A merged map is only as dangerous as
  the merger is mechanical. Testing pure fusion with live agents needs a
  version where the merge is arithmetic by construction, and we say so rather
  than claiming the deterministic result transferred.
- **P3 (mandatory checking spends rescue capacity exactly when checking is
  least affordable): CONFIRMED.** The verification rule fired in all three
  poisoned rounds, each time on the same loudly exaggerating settlement, and
  the checking arm reached 131 people against the fused arm's 207 — a 37
  percent loss paid entirely in verification flights that rescued nobody. The
  deterministic version's checking collapse replicated with a real agent
  holding the rule.

## Worth keeping from the transcripts

The two-witness dispatcher's round-one reasoning shows real corroboration
logic: it preferred a settlement confirmed by both witnesses over a slightly
larger single-witness claim, and it flagged a duplicated count across two
settlements as a possible transcription error. The capacity for judgment was
never the missing piece; the rule deciding where judgment sits in the pipeline
was.

## Disclosures

Dispatchers were memoryless across rounds; nothing in the pre-registration
required institutional memory, and none was provided. The verification trigger
was evaluated mechanically from the committed trigger table, and it fired only
in the three poisoned rounds. No agent output violated its schema, so no
retries were needed.
