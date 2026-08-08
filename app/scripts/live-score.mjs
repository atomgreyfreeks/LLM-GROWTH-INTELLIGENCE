/**
 * live-score — recomputes the mechanical scorecards for the three live agent
 * runs from their committed run logs and sealed answer keys, and writes each
 * scorecard.json in place. Run it to verify that the committed scorecards are
 * exactly what the logs and keys produce:
 *   node scripts/live-score.mjs          (from app/)
 * A clean git diff afterward is the proof.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TRUST = join(HERE, "..", "..", "docs", "trust");
const readJ = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJ = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2));

// ---------------------------------------------------------------- the boat
{
  const dir = join(TRUST, "the-boat", "live");
  const log = readJ(join(dir, "run-log.json"));
  const key = readJ(join(dir, "answer-key.json"));
  const idx = Object.fromEntries(key.names.map((n, i) => [n, i]));
  const arms = ["bacterial", "lichen", "root"];
  const score = { perRound: [], totals: {} };
  for (const a of arms) score.totals[a] = { clean: 0, poison: 0, verifies: 0 };
  for (const r of log.rounds) {
    const t = key.truth[r.round - 1];
    const row = { round: r.round, fired: r.fired };
    for (const a of arms) {
      const reached = r[a].reduce((s, n) => s + t[idx[n]], 0);
      row[a] = { picks: r[a], reached };
      const bucket = r.round < key.poisonFrom ? "clean" : "poison";
      score.totals[a][bucket] += reached;
    }
    if (r.fired) score.totals.root.verifies += 1;
    score.perRound.push(row);
  }
  let bestClean = 0, bestPoison = 0;
  key.truth.forEach((t, i) => {
    const top2 = [...t].sort((x, y) => y - x).slice(0, 2).reduce((s, v) => s + v, 0);
    if (i < key.poisonFrom - 1) bestClean += top2; else bestPoison += top2;
  });
  score.bestPossible = { clean: bestClean, poison: bestPoison };
  writeJ(join(dir, "scorecard.json"), score);
  console.log("the boat  ", arms.map((a) => `${a} clean ${score.totals[a].clean} poison ${score.totals[a].poison}`).join(" | "));
}

// -------------------------------------------------------------- the bridge
{
  const dir = join(TRUST, "the-bridge", "live");
  const log = readJ(join(dir, "run-log.json"));
  const key = readJ(join(dir, "answer-key.json"));
  const score = {};
  for (const armRun of log.arms) {
    const s = { rejections: armRun.rejections, phases: {} };
    for (const phase of ["control", "damage"]) {
      const a = armRun[phase].answers;
      const per = {};
      let correct = 0;
      for (const [q, want] of Object.entries(key.answers)) {
        per[q] = { got: a[q], want, ok: a[q] === want };
        if (a[q] === want) correct++;
      }
      s.phases[phase] = { correct, of: 8, per, pulls: armRun[phase].pulls };
    }
    score[armRun.arm] = s;
  }
  writeJ(join(dir, "scorecard.json"), score);
  console.log("the bridge", Object.entries(score).map(([a, s]) => `${a} control ${s.phases.control.correct}/8 damage ${s.phases.damage.correct}/8`).join(" | "));
}

// ----------------------------------------------------------------- the map
{
  const dir = join(TRUST, "the-map", "live");
  const log = readJ(join(dir, "run-log.json"));
  const key = readJ(join(dir, "answer-key.json"));
  const score = {};
  for (const armRun of log.arms) {
    const serves = armRun.served;
    const em = key.emergencies.map((e) => {
      const hit = serves.find((s) => s.town === e.town && s.round >= e.appears && s.round <= e.deadline);
      return { id: e.id, town: e.town, window: `${e.appears}-${e.deadline}`, people: e.people, servedRound: hit ? hit.round : null };
    });
    const emServed = em.filter((e) => e.servedRound !== null);
    const walkRounds = armRun.log.reduce((s, r) => s + (4 - r.servedNow.length), 0);
    const illegal = armRun.log.reduce((s, r) => s + r.illegal.length, 0);
    const retries = armRun.log.filter((r) => r.retried).length;
    score[armRun.arm] = {
      emergenciesServed: emServed.length, of: key.emergencies.length,
      peopleServed: emServed.reduce((s, e) => s + e.people, 0),
      totalServes: serves.length, idleOrWalkCrewRounds: walkRounds,
      illegalEdits: illegal, retriedRounds: retries,
      detail: em,
    };
  }
  writeJ(join(dir, "scorecard.json"), score);
  console.log("the map   ", Object.entries(score).map(([a, s]) => `${a} ${s.emergenciesServed}/${s.of} emergencies, ${s.peopleServed} people`).join(" | "));
}
