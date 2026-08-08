/**
 * THE BRIDGE, LIVE — world generator. Deterministic, seeded.
 * Writes 16 sensor reports (4 zones x 4), 8 trace questions, and the answer key
 * to docs/trust/the-bridge/live/. Damage plan is fixed by the pre-registration:
 * the north-anchorage and east-span findings are deleted before the repair phase.
 */
import { makeRng } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "trust", "the-bridge", "live");
const WORLD = join(OUT, "world");
mkdirSync(WORLD, { recursive: true });

const SEED = 41;
const r = makeRng(SEED * 2654435761);
const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
const val = (lo: number, hi: number, dp = 1) =>
  (lo + r() * (hi - lo)).toFixed(dp);

const ZONES = [
  { name: "north anchorage", ids: ["S01", "S02", "S03", "S04"] },
  { name: "south anchorage", ids: ["S05", "S06", "S07", "S08"] },
  { name: "east span", ids: ["S09", "S10", "S11", "S12"] },
  { name: "west span", ids: ["S13", "S14", "S15", "S16"] },
];

// One distinctive, question-able fact per sensor. The fact sentence is unique
// to its report; the surrounding sentences are routine filler.
type Fact = { fact: string; question: string };
const FACTS: Record<string, Fact> = {
  S01: {
    fact: `The primary hold-down bolts show a preload loss of ${val(8, 11)} percent against the commissioning record.`,
    question: "Which sensor report supports the statement that hold-down bolts in the north anchorage have lost preload since commissioning?",
  },
  S02: {
    fact: `Standing water was detected in the anchorage chamber sump for the third consecutive week.`,
    question: "Which sensor report supports the statement that water has been standing in an anchorage chamber for weeks?",
  },
  S03: {
    fact: `The upstream stay cable tension reads ${val(11, 14)} percent below its commissioning value.`,
    question: "Which sensor report supports the statement that a stay cable is reading well below its commissioning tension?",
  },
  S04: {
    fact: `Fresh corrosion staining has appeared on the splay saddle since the previous inspection cycle.`,
    question: "Which sensor report supports the statement that new corrosion staining has appeared on a splay saddle?",
  },
  S05: {
    fact: `The south tower tilt has held steady at ${val(0.10, 0.16, 2)} degrees for six cycles.`,
    question: "Which sensor report supports the statement that the south tower tilt has been steady across recent cycles?",
  },
  S06: {
    fact: `A dehumidification fan in the south chamber has failed and the relative humidity has climbed to ${val(72, 80, 0)} percent.`,
    question: "Which sensor report supports the statement that a dehumidification fan failure has raised humidity in an anchorage chamber?",
  },
  S07: {
    fact: `Wire-break acoustic events in the south cable band totalled ${Math.floor(3 + r() * 3)} this quarter, up from zero the previous quarter.`,
    question: "Which sensor report supports the statement that wire-break acoustic events have risen from zero this quarter?",
  },
  S08: {
    fact: `Grout injection at the south anchorage tendons was completed and verified this cycle.`,
    question: "Which sensor report supports the statement that tendon grout injection was completed and verified?",
  },
  S09: {
    fact: `The east midspan vertical deflection under the calibration truck ran ${val(6, 9)} percent above the design envelope.`,
    question: "Which sensor report supports the statement that midspan deflection under a calibration load exceeded the design envelope?",
  },
  S10: {
    fact: `An expansion joint at the east abutment is closing ${val(3, 5)} millimetres short of its free-movement range.`,
    question: "Which sensor report supports the statement that an expansion joint is short of its free-movement range?",
  },
  S11: {
    fact: `Deck accelerations in the east span crossed the comfort threshold twice during weekday peak traffic.`,
    question: "Which sensor report supports the statement that deck accelerations crossed the comfort threshold during peak traffic?",
  },
  S12: {
    fact: `A bearing at pier E2 recorded a temperature spike of ${val(9, 13)} degrees above ambient during afternoon load.`,
    question: "Which sensor report supports the statement that a pier bearing spiked well above ambient temperature under load?",
  },
  S13: {
    fact: `The west span strain gauges returned to baseline within ${val(1.5, 2.5)} minutes after the calibration truck passed.`,
    question: "Which sensor report supports the statement that west span strains recovered to baseline quickly after a calibration pass?",
  },
  S14: {
    fact: `Two deck drainage scuppers on the west span remain blocked and are ponding water at the kerb line.`,
    question: "Which sensor report supports the statement that blocked scuppers are ponding water on a span?",
  },
  S15: {
    fact: `The west parapet anchor pull-test held at ${val(96, 104, 0)} percent of specification.`,
    question: "Which sensor report supports the statement that a parapet anchor pull-test met its specification?",
  },
  S16: {
    fact: `Wind-induced vibration of the west hangers stayed inside limits through the storm on record day ${Math.floor(4 + r() * 20)}.`,
    question: "Which sensor report supports the statement that hanger vibration stayed inside limits through a recorded storm?",
  },
};

const FILLER = [
  () => `Ambient temperature during the reading window averaged ${val(9, 19)} degrees.`,
  () => `Sensor battery and telemetry checks passed with no dropouts.`,
  () => `Traffic during the window was ${pick(["light", "moderate", "heavy"])} with no lane closures.`,
  () => `The reading was cross-checked against the adjacent unit and agreed within tolerance.`,
  () => `No maintenance activity was logged near the instrument this cycle.`,
  () => `Humidity and dew point stayed inside the instrument's rated range.`,
];

for (const zone of ZONES) {
  for (const id of zone.ids) {
    const lines = [
      `# Sensor report ${id} — ${zone.name}`,
      ``,
      `Cycle reading, bridge monitoring network. Zone: ${zone.name}.`,
      ``,
      FILLER[Math.floor(r() * FILLER.length)](),
      FACTS[id].fact,
      FILLER[Math.floor(r() * FILLER.length)](),
      FILLER[Math.floor(r() * FILLER.length)](),
    ];
    writeFileSync(join(WORLD, `${id}.md`), lines.join("\n") + "\n");
  }
}

// Eight trace questions: two per zone, fixed here. Four of the eight target the
// zones whose findings the pre-registration deletes (north anchorage, east span).
const QUESTION_IDS = ["S01", "S03", "S06", "S07", "S09", "S12", "S14", "S15"];
const questions = QUESTION_IDS.map((id, i) => ({
  q: `Q${i + 1}`,
  text: FACTS[id].question,
}));
const key = {
  seed: SEED,
  zones: ZONES,
  damagedZones: ["north anchorage", "east span"],
  answers: Object.fromEntries(QUESTION_IDS.map((id, i) => [`Q${i + 1}`, id])),
  pullCap: 8,
};
writeFileSync(join(OUT, "questions.json"), JSON.stringify(questions, null, 2));
writeFileSync(join(OUT, "answer-key.json"), JSON.stringify(key, null, 2));
console.log("bridge live world written:", QUESTION_IDS.join(" "));
