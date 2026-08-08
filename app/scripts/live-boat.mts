/**
 * THE BOAT, LIVE — world generator. Deterministic, seeded.
 * Writes per-round satellite briefs and phone logs plus the ground-truth answer
 * key to docs/trust/the-boat/live/. Rounds 1-3 clean; rounds 4-6 poisoned:
 * three fixed settlements exaggerate on the phone, and the truly worst
 * settlement's phone lines are cut. In poisoned rounds the two witnesses
 * disagree about the top target by construction.
 */
import { makeRng } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "trust", "the-boat", "live");
const WORLD = join(OUT, "world");
mkdirSync(WORLD, { recursive: true });

const SEED = 43;
const r = makeRng(SEED * 2654435761);

const NAMES = [
  "Saltmarsh Row", "Herring Quay", "Dune Cottages", "Ternwick",
  "Greywater Stairs", "Pilot Green", "Cockle Strand", "Lantern Hill",
  "Mudflat Lane", "Osprey Point", "Wrack End", "Channel Head",
];
const N = NAMES.length;
const ROUNDS = 6;
const POISON_FROM = 4;

// Seeded, fixed roles: three exaggerating settlements for the poisoned season.
const shuffled = NAMES.map((_, i) => ({ i, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.i);
const EXAGGERATORS = shuffled.slice(0, 3);

// Ground truth per round: 4 hot settlements, the rest low. The true worst in
// poisoned rounds is never an exaggerator (its lines get cut instead).
const truth: number[][] = [];
const worstOf: number[] = [];
for (let round = 1; round <= ROUNDS; round++) {
  const need = new Array(N).fill(0).map(() => Math.floor(r() * 8));
  const order = NAMES.map((_, i) => ({ i, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.i);
  const hotPool = round >= POISON_FROM ? order.filter((i) => !EXAGGERATORS.includes(i)) : order;
  const hots = hotPool.slice(0, 4);
  hots.forEach((i, rank) => { need[i] = rank === 0 ? 38 + Math.floor(r() * 22) : 12 + Math.floor(r() * 18); });
  truth.push(need);
  worstOf.push(hots[0]);
}

const jitter = (n: number, f: number) => Math.max(0, Math.round(n * (1 - f + r() * 2 * f)));

for (let round = 1; round <= ROUNDS; round++) {
  const need = truth[round - 1];
  const worst = worstOf[round - 1];
  const poisoned = round >= POISON_FROM;

  // Satellite: clear over the true worst; 2 other settlements cloud-obscured.
  const occludable = shuffled.filter((i) => i !== worst).slice(3, 5 + (round % 2));
  const sat = [
    `# Satellite flood brief — round ${round}`,
    ``,
    `Pass completed over the coast this morning. Figures are people visible in`,
    `floodwater per settlement. Cloud cover blocks some cells.`,
    ``,
  ];
  for (let i = 0; i < N; i++) {
    sat.push(occludable.includes(i)
      ? `- ${NAMES[i]}: cloud obscured, no reading`
      : `- ${NAMES[i]}: ${jitter(need[i], 0.1)} people visible in water`);
  }
  writeFileSync(join(WORLD, `round${round}-satellite.md`), sat.join("\n") + "\n");

  // Phone log: prose messages. Clean rounds are honest within 20 percent.
  // Poisoned rounds: exaggerators multiply, the true worst goes silent.
  const phone = [
    `# Phone log — round ${round}`,
    ``,
    `Calls received at the rescue office since the last pass, as transcribed.`,
    ``,
  ];
  for (let i = 0; i < N; i++) {
    if (poisoned && i === worst) continue; // lines cut: no calls at all
    const reported = poisoned && EXAGGERATORS.includes(i)
      ? Math.max(60, jitter(Math.max(need[i], 10) * (4 + Math.floor(r() * 2)), 0.1))
      : jitter(need[i], 0.2);
    if (reported === 0 && r() < 0.6) continue;
    const line = reported === 0
      ? `caller reports the water is in the lanes but everyone is accounted for.`
      : `caller counts about ${reported} people needing rescue from roofs and upper floors.`;
    phone.push(`- ${NAMES[i]}: ${line}`);
  }
  if (poisoned) {
    phone.push(``);
    phone.push(`No calls have come through from ${NAMES[worst]} since the last pass.`);
  }
  writeFileSync(join(WORLD, `round${round}-phone.md`), phone.join("\n") + "\n");
}

const key = {
  seed: SEED,
  names: NAMES,
  rounds: ROUNDS,
  poisonFrom: POISON_FROM,
  exaggerators: EXAGGERATORS.map((i) => NAMES[i]),
  truth,
  worstOf: worstOf.map((i) => NAMES[i]),
  slotsPerRound: 2,
};
writeFileSync(join(OUT, "answer-key.json"), JSON.stringify(key, null, 2));
console.log("boat live world written; exaggerators:", key.exaggerators.join(", "),
  "| worst per round:", key.worstOf.join(", "));
