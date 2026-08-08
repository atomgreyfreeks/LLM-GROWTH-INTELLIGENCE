# The bridge, live — pre-registration (written before any agent ran)

2026-08-05. The deterministic version of this experiment
(`docs/trust/the-bridge/`) found that a summarizing system which records what it
discards can repair its evidence trails after damage, and a system which keeps
only each conclusion's strongest support cannot. This run tests whether the same
result holds when the summarizing is done by real Claude agents instead of
scripted ones.

## Scenario

A city monitors an aging bridge through 16 sensor reports, four per zone: north
anchorage, south anchorage, east span, west span. One engineer agent per zone
summarizes its four reports into one zone finding. One chief agent reads the
four zone findings and writes two safety claims plus a verdict sentence. Then
damage strikes: two of the four zone findings are deleted. A fresh repair agent
per arm must then answer eight trace questions of the form "which sensor report
supports this statement?", using only the surviving artifacts and a capped
number of archive pulls.

## Growth rules under test (the arms differ only in the provenance rule)

- **Arm "slime mould"** — the strongest support wins. Every finding and claim
  carries exactly four provenance lines, and all four are spent on a single
  source: the source id plus three verbatim sentences quoted from it. Nothing
  records the sources that were dropped.
- **Arm "fungal network with coral records"** — neighbors carry the proof.
  Every finding and claim carries exactly four provenance lines: up to three
  cited source ids (one line each), plus one tombstone line naming every
  dropped source id. A tombstone is a small permanent record of what was cut.

Both arms spend exactly four provenance lines per artifact, so the budget is
matched by construction.

## Learnings applied from the first live runs

- Capacity is a slot cap (four provenance lines), never a word budget.
- The rule is binding machinery in the prompt and is validated mechanically;
  an artifact that violates its arm's provenance format is rejected once with
  the format restated, and every rejection is disclosed in the results.
- A control phase runs before damage, and the run is void if it fails.
- The repair agent's archive access is capped at eight pulls by report id, so
  tracing cannot be brute-forced by reading everything.

  **Amendment, 2026-08-05, before any agent ran.** The first draft capped
  archive pulls at six and required both arms to trace seven of eight in the
  control phase. Those two numbers are jointly impossible for the slime-mould
  arm by arithmetic alone: its artifacts can name at most six distinct report
  ids directly, so answering seven questions requires hunting through zones by
  content, and six pulls cannot cover the remaining questions even with
  perfect play. The cap is now eight pulls, and the control gate is now six of
  eight for both arms, so the control phase tests the pipeline rather than
  voiding the run by construction.
- The damage targets are fixed here, before any run: the north anchorage and
  east span findings are deleted. Four of the eight trace questions target
  reports in those two zones, so both arms lose the same ground truth.

## Mechanical scoring

Against `answer-key.json`, which maps each of the eight trace questions to the
one sensor report id that answers it. Score: correct ids out of eight, control
phase and damage phase, per arm. Secondary counts: archive pulls used, format
rejections.

## Pre-registered predictions

- **P1 (control, voids the run if it fails):** before damage, both arms trace
  at least six of eight questions correctly.
- **P2 (the record-keeping claim):** after damage, the fungal-with-coral arm
  traces at least six of eight; the slime-mould arm traces at most three of
  eight.
- **P3 (mechanism check):** the slime-mould arm's failures concentrate on the
  four questions whose reports sat under the deleted findings.

**Falsifier:** if the slime-mould arm still traces six or more after damage,
then real agents route around missing provenance at this scale — perhaps by
inferring ids from content within the pull cap — and record-keeping buys less
than the deterministic version claims. We publish that.

## Fleet size

Per arm: four engineer agents, one chief agent, one repair agent run twice
(control phase and damage phase). Two arms: about sixteen agent calls plus any
disclosed retries. Agent model: Claude Sonnet, matching the earlier fleet runs.
