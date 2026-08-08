/**
 * FLEET SHAPES v2 — improved world. Fixes from run 1, one per flaw:
 *  1. Budget binds: readers read 2 of 4 (12 of 24 towns per round, 50%).
 *  2. Warnings lead: neighbor cues appear in ROUND 2, eruptions in ROUND 3 —
 *     so the fungus arm's flag mechanism can act before scoring ends.
 *  3. One stressor per round: R1 control · R2 cues · R3 eruption · R4 damage · R5 aftermath.
 *  4. Seeded shuffle breaks alphabetical tie-protection.
 * Plus an INCUMBENT TRAP: the #1 need town of R1-2 is fully fixed from R3 on,
 * to measure how long bosses keep aiding a recovered favorite.
 * Emergencies live in districts whose readers survive the R4 damage (readers 3 & 6 die).
 */
import { makeRng } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "two-shapes", "fleet-shapes", "v2");
const SEED = 11;
const r = makeRng(SEED * 2654435761);

const NAMES = [
  "Ashfield", "Barrow Cross", "Cinder Row", "Dunmore",
  "Eastholt", "Fernway", "Gorse Hill", "Harrow Bend",
  "Ivy Hollow", "Junction Vale", "Kiln Flats", "Larkmoor",
  "Millstead", "Northgate", "Oxbow", "Pinemarch",
  "Quarry Edge", "Rushwater", "Saltern", "Thistledown",
  "Umberfield", "Vetch Green", "Wrenfall", "Yarrow Point",
];
const DISTRICT = (i: number) => Math.floor(i / 4) + 1;
// seeded tie-break order (fix 4)
const tieOrder = NAMES.map((n, i) => ({ n, i, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.i);
const tieRank: number[] = new Array(24); tieOrder.forEach((idx, rank) => { tieRank[idx] = rank; });

const ladder = [8.9, 8.2, 7.5, 6.7, 6.0, 5.4, 4.9, 4.5, 4.1, 3.7, 3.4, 3.1, 2.8, 2.5, 2.3, 2.1, 1.9, 1.7, 1.5, 1.3, 1.2, 1.1, 1.0, 0.9];
const perm = NAMES.map((_, i) => ({ i, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.i);
const need1 = new Array(24).fill(0);
perm.forEach((idx, rank) => { need1[idx] = ladder[rank] + Math.round((r() - 0.5) * 4) / 10; });

const rank1 = need1.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
const incumbent = rank1[0]; // the R1-2 favorite that gets FIXED from R3
// emergencies: quiet towns (bottom 8) in districts 1..2 and 4..5 (readers alive through damage)
const quietPool = rank1.slice(16);
const em1 = quietPool.find((i) => DISTRICT(i) <= 2 && i !== incumbent)!;
const em2 = quietPool.find((i) => DISTRICT(i) >= 4 && DISTRICT(i) <= 5 && DISTRICT(i) !== DISTRICT(em1) && i !== incumbent)!;

const drift = () => Math.round((r() - 0.35) * 10) / 10;
const clamp = (n: number) => Math.max(0.3, Math.min(9.5, n));
const needs: number[][] = [need1];
for (let round = 2; round <= 5; round++) {
  const prev = needs[round - 2];
  needs.push(prev.map((n, i) => {
    if (i === incumbent && round >= 3) return 1.4; // fixed, and stays fixed
    if ((i === em1 || i === em2) && round >= 3) return clamp(9.2 + r() * 0.3); // erupted, stays hot
    return clamp(n + drift());
  }));
}

const pop = NAMES.map(() => 140 + Math.floor(r() * 2400));
const water = (n: number) => n > 7 ? "wells testing unsafe; treatment offline" : n > 5 ? "boil advisory in effect" : n > 3 ? "pressure reduced, supply holding" : "normal";
const power = (n: number) => n > 7 ? "grid down; generators failing" : n > 5 ? "rolling outages" : n > 3 ? "partial restoration" : "stable";
const medical = (n: number) => n > 7 ? "clinic over capacity; supplies critical" : n > 5 ? "clinic strained; resupply requested" : n > 3 ? "routine load" : "no unusual activity";
const access = (n: number) => n > 7 ? "primary road impassable" : n > 5 ? "one lane open with delays" : "open";

function cueFor(i: number, round: number): string | null {
  if (round === 2) {
    for (const em of [em1, em2])
      if (i !== em && DISTRICT(i) === DISTRICT(em))
        return `first families arriving from ${NAMES[em]}; they say conditions there are deteriorating fast and going unreported.`;
  }
  if (round >= 3 && i === incumbent)
    return "water treatment fully restored this round; relief crews demobilizing; conditions normal.";
  return null;
}

function fileText(i: number, round: number): string {
  const n = needs[round - 1][i];
  const incident = n > 8.5 ? "Multiple households report acute shortages; volunteers overwhelmed."
    : n > 7 ? "Sustained deterioration since last report."
    : n > 5 ? "Conditions difficult but managed."
    : n > 3 ? "Scattered issues, no acute cases."
    : "No significant incidents.";
  const cue = cueFor(i, round);
  return [
    `${NAMES[i].toUpperCase()} — STATUS LOG, ROUND ${round}`,
    `District ${DISTRICT(i)}. Population ${pop[i].toLocaleString("en-US")}.`,
    `Water: ${water(n)}. Power: ${power(n)}. Medical: ${medical(n)}. Road access: ${access(n)}.`,
    `Incidents: ${incident}`,
    cue ? `Note from the field: ${cue}` : "",
  ].filter(Boolean).join("\n");
}

const key = {
  seed: SEED,
  communities: NAMES.map((name, i) => ({ name, district: DISTRICT(i), pop: pop[i], tieRank: tieRank[i], need: needs.map((rr) => Math.round(rr[i] * 10) / 10) })),
  incumbentTrap: { name: NAMES[incumbent], district: DISTRICT(incumbent), fixedFromRound: 3 },
  emergencies: [em1, em2].map((i) => ({ name: NAMES[i], district: DISTRICT(i), cuesRound: 2, eruptsRound: 3 })),
  trueTop4: needs.map((rr) => rr.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, i]) => NAMES[i])),
  damage: { round: 4, deadReaders: [3, 6] },
};

const world: Record<string, Record<string, string>> = {};
for (let round = 1; round <= 5; round++) {
  const dir = join(OUT, "world", `round${round}`);
  mkdirSync(dir, { recursive: true });
  world[`round${round}`] = {};
  for (let i = 0; i < 24; i++) {
    const txt = fileText(i, round);
    writeFileSync(join(dir, `${NAMES[i].toLowerCase().replace(/[^a-z]+/g, "-")}.md`), txt + "\n");
    world[`round${round}`][NAMES[i]] = txt;
  }
}
writeFileSync(join(OUT, "answer-key.json"), JSON.stringify(key, null, 2));
writeFileSync(join(OUT, "world-data.js"), "const WORLD = " + JSON.stringify({ names: NAMES, district: NAMES.map((_, i) => DISTRICT(i)), tieRank, files: world }) + ";\n");
console.log("incumbent trap:", key.incumbentTrap.name, "(fixed from R3)");
console.log("emergencies:", key.emergencies.map((e) => `${e.name} (D${e.district}, cues R2, erupts R3)`).join(", "));
console.log("true top4 by round:");
key.trueTop4.forEach((t, i) => console.log(`  R${i + 1}: ${t.join(" / ")}`));
console.log(`written -> ${OUT}`);
