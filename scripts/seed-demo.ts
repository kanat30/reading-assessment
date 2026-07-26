/**
 * Seed a realistic demo classroom for the Eileen demo (roadmap: "Seed dashboard
 * with realistic sessions before the demo").
 *
 * Creates an isolated demo school + teacher (own RLS tenant — invisible to real
 * schools) with a grade-6 roster and ~50 completed sessions spread across:
 *   - Period 2: Level 5 median-of-3 MOY screening (on-grade, incl. 2 partial reads)
 *   - Period 4: Level 4 median-of-3 MOY screening (below-grade routing)
 *   - Two single-passage progress-monitoring checks
 *
 * Realism strategy: sessions are simulated word-by-word against the real library
 * passages, then metrics/error-patterns are computed by the REAL scoring engine
 * (calculateMetrics, computeErrorPatterns) — so WCPM, accuracy, benchmark bands,
 * transcripts, and patterns are internally consistent, not hand-picked numbers.
 * Comprehension answers follow the library-passage convention (stored in
 * scores_json, not comprehension_answers — synthetic question ids aren't FK-safe).
 * No audio files are created (the report renders without audio).
 *
 * Run:    npx tsx scripts/seed-demo.ts          (aborts if demo school exists)
 *         npx tsx scripts/seed-demo.ts --reset  (delete + recreate)
 *
 * Login after seeding: demo@fluencyscope.app / password printed at the end.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { randomUUID } from "crypto";
import { calculateMetrics } from "../lib/scoring/metrics";
import { computeErrorPatterns } from "../lib/scoring/patterns";
import { getPassageById, Passage } from "../lib/passages/library";
import { SessionEvent, EventType, ComprehensionAnswer } from "../lib/scoring/types";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SCHOOL_NAME = "Riverside Middle School (Demo)";
const TEACHER_EMAIL = "demo@fluencyscope.app";
const TEACHER_NAME = "Daniela Rivera";
const TEACHER_PASSWORD = process.env.DEMO_TEACHER_PASSWORD || "FluencyDemo!2026";

// ---------------------------------------------------------------------------
// Deterministic PRNG so reruns produce the same classroom
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260724);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const jitter = (base: number, spread: number) => base + (rng() * 2 - 1) * spread;

// ---------------------------------------------------------------------------
// Student profiles
// ---------------------------------------------------------------------------
interface StudentProfile {
  first: string;
  last: string;
  /** target median WCPM (per-passage scores jitter around this) */
  wcpm: number;
  /** target accuracy as a fraction */
  accuracy: number;
  prosody: 1 | 2 | 3 | 4;
  /** comprehension statuses for the 3 questions, per passage read */
  comp: ("correct" | "partial" | "incorrect")[];
  review?: "new" | "reviewed" | "approved" | "flagged";
  /** how many of the 3 passages were completed (median-of-3 groups) */
  passagesRead?: number;
  note?: string;
}

// Period 2 — on-grade 6th graders, Level 5 (grade-5 MOY norms: p50 133 / p25 109)
const PERIOD_2: StudentProfile[] = [
  { first: "Amara", last: "Okafor", wcpm: 168, accuracy: 0.99, prosody: 4, comp: ["correct", "correct", "correct"], review: "reviewed" },
  { first: "Mateo", last: "Reyes", wcpm: 152, accuracy: 0.98, prosody: 4, comp: ["correct", "correct", "partial"] },
  { first: "Jayden", last: "Thompson", wcpm: 145, accuracy: 0.97, prosody: 3, comp: ["correct", "partial", "correct"], review: "reviewed" },
  { first: "Sofia", last: "Almanzar", wcpm: 138, accuracy: 0.97, prosody: 3, comp: ["correct", "correct", "incorrect"] },
  { first: "Wei", last: "Chen", wcpm: 134, accuracy: 0.98, prosody: 3, comp: ["correct", "partial", "partial"] },
  { first: "Isabella", last: "Santiago", wcpm: 126, accuracy: 0.95, prosody: 3, comp: ["correct", "partial", "incorrect"] },
  { first: "Tyler", last: "Washington", wcpm: 118, accuracy: 0.94, prosody: 2, comp: ["partial", "correct", "incorrect"], note: "Rushed the first passage — pace steadier on the second read. Worth re-checking phrasing next window." },
  { first: "Fatima", last: "Rahman", wcpm: 112, accuracy: 0.93, prosody: 2, comp: ["partial", "partial", "incorrect"] },
  { first: "Marcus", last: "Bell", wcpm: 96, accuracy: 0.90, prosody: 2, comp: ["partial", "incorrect", "incorrect"], review: "flagged", note: "Several flagged errors look like dialect pronunciation, not decoding errors — approved the words as read. Keep an eye on the multisyllabic pattern; it matches what I see in class." },
  { first: "Emily", last: "Novak", wcpm: 78, accuracy: 0.86, prosody: 1, comp: ["incorrect", "partial", "incorrect"], review: "flagged", note: "Well below benchmark on all three passages. Recommend follow-up with 1:1 running record and possible referral to intervention block." },
  // Partial reads — median-of-3 in progress
  { first: "Diego", last: "Fuentes", wcpm: 141, accuracy: 0.97, prosody: 3, comp: ["correct", "correct", "partial"], passagesRead: 2 },
  { first: "Nia", last: "Jean-Baptiste", wcpm: 122, accuracy: 0.95, prosody: 3, comp: ["correct", "partial", "partial"], passagesRead: 1 },
];

// Period 4 — below-grade readers routed to Level 4 (grade-4 MOY norms: p50 120 / p25 93)
const PERIOD_4: StudentProfile[] = [
  { first: "Aaliyah", last: "Brown", wcpm: 132, accuracy: 0.97, prosody: 3, comp: ["correct", "correct", "partial"], review: "reviewed" },
  { first: "Kevin", last: "Zhang", wcpm: 121, accuracy: 0.96, prosody: 3, comp: ["correct", "partial", "correct"] },
  { first: "Valentina", last: "Morales", wcpm: 108, accuracy: 0.93, prosody: 2, comp: ["partial", "correct", "incorrect"] },
  { first: "Ibrahim", last: "Diallo", wcpm: 97, accuracy: 0.92, prosody: 2, comp: ["partial", "partial", "incorrect"], note: "Newcomer — accent flagged a few words the first time; overrode them as correct. Fluency itself is coming along faster than the band suggests." },
  { first: "Destiny", last: "Rivera", wcpm: 84, accuracy: 0.89, prosody: 1, comp: ["incorrect", "incorrect", "partial"], review: "flagged" },
];

// Progress-monitoring singles — Level 4, one passage each
const PROGRESS: StudentProfile[] = [
  { first: "Andre", last: "Simmons", wcpm: 102, accuracy: 0.93, prosody: 2, comp: ["partial", "correct", "incorrect"] },
  { first: "Lucia", last: "Herrera", wcpm: 115, accuracy: 0.95, prosody: 3, comp: ["correct", "partial", "partial"] },
];

// ---------------------------------------------------------------------------
// Comprehension answer bank (per library question id)
// ---------------------------------------------------------------------------
interface AnswerVariants {
  expected: string;
  correct: string;
  partial: string;
  incorrect: string;
}
const ANSWERS: Record<string, AnswerVariants> = {
  "L4-A-1": {
    expected: "The journey would take roughly seven months.",
    correct: "It would take about seven months to get there.",
    partial: "A few months I think, like more than half a year.",
    incorrect: "A couple of weeks on a rocket.",
  },
  "L4-A-2": {
    expected: "No breathable air (the atmosphere is mostly carbon dioxide) and extreme temperatures that drop to negative one hundred degrees at night.",
    correct: "There is no air you can breathe and it gets super cold at night, like negative one hundred degrees.",
    partial: "It's really cold there.",
    incorrect: "There are aliens and dust storms everywhere.",
  },
  "L4-A-3": {
    expected: "Some argue that becoming a species that lives on more than one planet is essential for humanity's long-term survival.",
    correct: "Because if humans live on more than one planet, humanity could survive even if something happens to Earth.",
    partial: "Because it would be cool to explore and learn new science stuff.",
    incorrect: "Because Mars has gold and money there.",
  },
  "L4-B-1": {
    expected: "The only way to travel between Manhattan and Brooklyn was by ferry boat.",
    correct: "They had to take ferry boats across the river.",
    partial: "They went by boat or maybe swam, some kind of water travel.",
    incorrect: "They used the subway trains.",
  },
  "L4-B-2": {
    expected: "Washington Roebling became seriously ill from the dangerous underwater conditions and had to watch construction through a telescope from his bedroom while his wife Emily delivered his instructions.",
    correct: "He got really sick from working underwater and had to watch from his window with a telescope while his wife Emily brought his instructions to the workers.",
    partial: "He got sick during the building.",
    incorrect: "He fell off the bridge and broke his leg.",
  },
  "L4-B-3": {
    expected: "The East River was too wide and too deep for ordinary construction methods, and the bridge had to be extremely tall so ships could pass beneath it.",
    correct: "The river was really wide and deep so normal building methods wouldn't work, and it had to be tall enough for ships to go under.",
    partial: "Because the river was big and it was hard to build back then.",
    incorrect: "Because nobody wanted to pay for it.",
  },
  "L4-C-1": {
    expected: "Hunters and ranchers had eliminated them by 1926, believing wolves were dangerous pests that killed livestock.",
    correct: "Hunters and ranchers killed them off because they thought wolves were pests that killed their farm animals.",
    partial: "People thought they were dangerous.",
    incorrect: "The wolves left on their own to find food.",
  },
  "L4-C-2": {
    expected: "Elk populations exploded — without wolves to hunt them, the herds grew larger and larger.",
    correct: "The elk population exploded because nothing was hunting them anymore.",
    partial: "There got to be more elk.",
    incorrect: "The elk died out without the wolves.",
  },
  "L4-C-3": {
    expected: "The wolves changed the whole ecosystem — trees grew back, songbirds and beavers returned, and the new trees even stabilized riverbanks and changed how the rivers flowed.",
    correct: "The wolves fixed the whole ecosystem — trees came back, then songbirds and beavers returned, and the tree roots even changed how the rivers flowed.",
    partial: "It helped the trees grow again.",
    incorrect: "The wolves scared away the tourists.",
  },
  "L5-A-1": {
    expected: "More than eighty percent of Earth's ocean floor has never been mapped or seen.",
    correct: "More than eighty percent of it has never been mapped or seen.",
    partial: "Most of it, like over half.",
    incorrect: "About ten percent.",
  },
  "L5-A-2": {
    expected: "Bioluminescence is when creatures produce their own light — anglerfish use glowing lures to attract prey and some squid release glowing ink to confuse predators.",
    correct: "It's when animals make their own light. They use it to attract prey, like the anglerfish's glowing lure, or to confuse predators.",
    partial: "It means they glow in the dark.",
    incorrect: "It's a kind of electric fish that shocks things.",
  },
  "L5-A-3": {
    expected: "Entire ecosystems exist near the vents without any sunlight, which changed scientists' understanding of where life can exist — similar environments might harbor life on moons like Europa.",
    correct: "Because whole ecosystems live there with no sunlight at all, so scientists realized life can exist in places they thought were impossible, maybe even on other moons.",
    partial: "Because they found weird animals living down there.",
    incorrect: "Because the volcanoes might erupt and destroy the ocean.",
  },
  "L5-B-1": {
    expected: "James Naismith invented basketball in 1891 because he needed an indoor game to keep his students active during the cold winter months.",
    correct: "James Naismith invented it because he needed an indoor game to keep his students active in the winter.",
    partial: "Some gym teacher a long time ago.",
    incorrect: "Michael Jordan invented it to get famous.",
  },
  "L5-B-2": {
    expected: "By 1936, basketball became an official Olympic sport.",
    correct: "In 1936.",
    partial: "Sometime in the 1900s.",
    incorrect: "In the 1990s when the NBA started.",
  },
  "L5-B-3": {
    expected: "The basic skills translate everywhere — a court and a ball are all you need, and the joy of the game is the same whether on polished hardwood or cracked concrete.",
    correct: "Because anyone anywhere can play it — you just need a court and a ball, and the game feels the same no matter what country you're in.",
    partial: "Because lots of countries play basketball.",
    incorrect: "Because all the announcers speak the same language.",
  },
  "L5-C-1": {
    expected: "The brain stores bits and pieces of information and reconstructs them each time you remember something — it does not record like a video camera.",
    correct: "It doesn't record like a video camera — it stores bits and pieces and rebuilds the memory each time you remember it.",
    partial: "It keeps memories in your neurons.",
    incorrect: "It records everything exactly like a video.",
  },
  "L5-C-2": {
    expected: "While you sleep, the brain sorts through the day's experiences and transfers important information from short-term storage to long-term memory.",
    correct: "Because while you sleep your brain sorts what to keep and moves important stuff into long-term memory.",
    partial: "Sleep helps your brain rest so it works better.",
    incorrect: "Because you dream about your memories.",
  },
  "L5-C-3": {
    expected: "Taking breaks, getting enough sleep, engaging emotionally with material, connecting new facts to things you know, and reviewing information over time.",
    correct: "Studying before bed, taking breaks, reviewing stuff more than once, and connecting new facts to things you already know.",
    partial: "Study a lot and get sleep.",
    incorrect: "Cram everything right before the test.",
  },
};

const FEEDBACK = {
  correct: [
    "Accurate and complete — matches the passage.",
    "Captures the key detail from the passage.",
    "Complete answer with support from the text.",
  ],
  partial: [
    "Shows partial understanding; missing a key detail from the passage.",
    "On the right track but incomplete.",
    "General idea is there; the specific detail from the passage is missing.",
  ],
  incorrect: [
    "Not supported by the passage.",
    "Does not match what the passage states.",
    "Answer conflicts with the passage.",
  ],
};

// ---------------------------------------------------------------------------
// Prosody descriptor bank (NAEP ORF scale)
// ---------------------------------------------------------------------------
const PROSODY_BANK: Record<number, { expression: string; phrasing: string; pace: string; explanation: string }> = {
  4: {
    expression: "Reads with expressive interpretation throughout",
    phrasing: "Larger, meaningful phrase groups",
    pace: "Consistent, conversational pace",
    explanation: "Reads primarily in larger, meaningful phrase groups with expressive interpretation. Deviations from the text do not detract from the overall structure of the passage.",
  },
  3: {
    expression: "Some expressive interpretation present",
    phrasing: "Mostly three- and four-word phrase groups",
    pace: "Generally consistent pace",
    explanation: "Reads primarily in three- or four-word phrase groups. Most phrasing seems appropriate and preserves the syntax of the passage, with some expressive interpretation.",
  },
  2: {
    expression: "Little expressive interpretation",
    phrasing: "Two-word phrases with some choppiness",
    pace: "Uneven pace with hesitations",
    explanation: "Reads primarily in two-word phrases with some three- or four-word groupings. Some word-by-word reading may be present, and word groupings may seem awkward.",
  },
  1: {
    expression: "Reads without expressive interpretation",
    phrasing: "Primarily word-by-word",
    pace: "Slow and laborious",
    explanation: "Reads primarily word-by-word. Occasional two-word or three-word phrases may occur, but these are infrequent and do not preserve meaningful syntax.",
  },
};

// ---------------------------------------------------------------------------
// Read simulation
// ---------------------------------------------------------------------------
const FUNCTION_SWAPS: Record<string, string> = {
  the: "a", a: "the", his: "the", her: "the", would: "will", could: "can",
  this: "the", these: "those", that: "the", its: "the", their: "the",
  was: "is", were: "are", has: "had", have: "had", and: "an",
};

function clean(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function mangleSubstitution(word: string): string {
  const w = clean(word);
  if (FUNCTION_SWAPS[w]) return FUNCTION_SWAPS[w];
  if (w.endsWith("tion")) return w + "s";
  if (w.endsWith("ing")) return w.slice(0, -3);
  if (w.endsWith("ed")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w + "s";
}

function manglePronunciation(word: string): string {
  // drop one internal vowel: "temperature" -> "tempeature"
  const w = clean(word);
  for (let i = Math.floor(w.length / 2); i < w.length - 1; i++) {
    if ("aeiou".includes(w[i])) return w.slice(0, i) + w.slice(i + 1);
  }
  return w.slice(0, -2);
}

interface SimulatedRead {
  events: SessionEvent[];
  duration: number;
}

function simulateRead(passage: Passage, profile: StudentProfile, wcpmTarget: number): SimulatedRead {
  const words = passage.text.trim().split(/\s+/);
  const duration = Number(jitter(60.3, 0.5).toFixed(1));
  const correctTarget = Math.round((wcpmTarget * duration) / 60);
  const errorCount = Math.max(0, Math.round(correctTarget * (1 - profile.accuracy) / profile.accuracy));
  const attempted = Math.min(words.length, correctTarget + errorCount);
  const selfCorrections = profile.accuracy > 0.95 ? Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);

  // Choose error positions: bias toward long words (multisyllabic pattern),
  // -tion words, and function words; keep omission runs short so the stop-point
  // logic never mistakes them for the end of the read.
  const errorIndices = new Set<number>();
  const candidates = [...Array(attempted).keys()].slice(2);
  const longWords = candidates.filter((i) => clean(words[i]).length >= 9);
  const tionWords = candidates.filter((i) => clean(words[i]).endsWith("tion"));
  const shortWords = candidates.filter((i) => clean(words[i]).length <= 4);
  let guard = 0;
  while (errorIndices.size < errorCount && guard++ < 500) {
    const r = rng();
    const pool = r < 0.5 && longWords.length ? longWords : r < 0.65 && tionWords.length ? tionWords : r < 0.85 ? shortWords : candidates;
    const idx = pick(pool.length ? pool : candidates);
    // avoid 3+ consecutive omission-like clusters
    if (!errorIndices.has(idx) && !(errorIndices.has(idx - 1) && errorIndices.has(idx - 2))) {
      errorIndices.add(idx);
    }
  }

  const scIndices = new Set<number>();
  guard = 0;
  while (scIndices.size < selfCorrections && guard++ < 100) {
    const idx = 3 + Math.floor(rng() * (attempted - 4));
    if (!errorIndices.has(idx)) scIndices.add(idx);
  }

  const events: SessionEvent[] = [];

  // First pass: decide event types
  const types: { type: EventType; spoken: string | null }[] = [];
  for (let i = 0; i < attempted; i++) {
    const expected = words[i];
    if (errorIndices.has(i)) {
      const r = rng();
      if (r < 0.3) {
        types.push({ type: "omission", spoken: null });
      } else if (r < 0.8) {
        types.push({ type: "substitution", spoken: mangleSubstitution(expected) });
      } else {
        types.push({ type: "mispronunciation", spoken: manglePronunciation(expected) });
      }
    } else if (scIndices.has(i)) {
      types.push({ type: "self_correction", spoken: clean(words[i]) });
    } else {
      types.push({ type: "correct", spoken: clean(words[i]) });
    }
  }

  const voiced = types.filter((t) => t.spoken !== null).length;
  const msPerWord = (duration * 1000 - 800) / voiced;
  let cursor = 400 + Math.floor(rng() * 300);
  for (let i = 0; i < attempted; i++) {
    const t = types[i];
    if (t.spoken === null) {
      events.push({
        word_index: i, expected_word: words[i], spoken_word: null,
        start_timestamp_ms: null, end_timestamp_ms: null,
        event_type: t.type, confidence_score: null,
      });
      continue;
    }
    let len = Math.max(120, Math.round(jitter(msPerWord, msPerWord * 0.35)));
    if (t.type === "self_correction") len = Math.round(len * 2.2); // restart takes time
    if (/[.!?]$/.test(words[i])) len += Math.round(180 + rng() * 350); // sentence pause
    const start = cursor;
    const end = Math.min(Math.round(duration * 1000), start + len);
    cursor = end + Math.round(rng() * 40);
    const conf = t.type === "correct" || t.type === "self_correction"
      ? 0.87 + rng() * 0.12
      : 0.55 + rng() * 0.3;
    events.push({
      word_index: i, expected_word: words[i], spoken_word: t.spoken,
      start_timestamp_ms: start, end_timestamp_ms: end,
      event_type: t.type, confidence_score: Number(conf.toFixed(3)),
    });
  }

  // Trailing never-reached words: omission events with no voice, exactly as the
  // aligner emits them; the engine's cutoff excludes them from scoring.
  for (let i = attempted; i < words.length; i++) {
    events.push({
      word_index: i, expected_word: words[i], spoken_word: null,
      start_timestamp_ms: null, end_timestamp_ms: null,
      event_type: "omission", confidence_score: null,
    });
  }

  return { events, duration };
}

function makeWaveform(events: SessionEvent[], duration: number): number[] {
  const peaks: number[] = [];
  const voiced = events.filter((e) => e.start_timestamp_ms !== null);
  const totalMs = duration * 1000;
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * totalMs;
    const speaking = voiced.some((e) => t >= e.start_timestamp_ms! && t <= e.end_timestamp_ms! + 60);
    const base = speaking ? 0.3 + rng() * 0.5 : 0.02 + rng() * 0.05;
    peaks.push(Number(base.toFixed(3)));
  }
  return peaks;
}

const BAND_PHRASE: Record<string, string> = {
  at: "at benchmark",
  below: "below benchmark",
  well_below: "well below benchmark",
};

function makeSummary(
  profile: StudentProfile, wcpm: number, accuracy: number,
  band: string, patternLabel: string | null, compScore: number, compTotal: number
): string {
  const first = profile.first;
  const s1 = `${first} read ${wcpm} words correct per minute with ${accuracy}% accuracy, placing ${BAND_PHRASE[band]} for the middle-of-year window.`;
  const s2 = patternLabel
    ? `The most consistent error pattern was ${patternLabel.toLowerCase()}, which is worth a quick check during small-group time.`
    : `Errors were isolated with no consistent pattern across the reading.`;
  const s3 = compScore / compTotal >= 0.7
    ? `Comprehension responses indicate the reading was well understood.`
    : compScore / compTotal >= 0.4
      ? `Comprehension responses were mixed, so the rate above may overstate functional reading on this passage.`
      : `Comprehension responses suggest limited understanding of the passage, so interpret the rate with caution.`;
  return `${s1} ${s2} ${s3}`;
}

function makeComprehension(passage: Passage, statuses: ("correct" | "partial" | "incorrect")[]) {
  const answers: ComprehensionAnswer[] = passage.questions.map((q, i) => {
    const status = statuses[i % statuses.length];
    const bank = ANSWERS[q.id];
    return {
      question_id: q.id,
      student_answer: bank ? bank[status] : "I'm not sure.",
      is_correct: status === "correct",
      status,
      feedback: pick(FEEDBACK[status]),
      expected_answer: bank?.expected,
    };
  });
  const score = answers.reduce((sum, a) => sum + (a.status === "correct" ? 1 : a.status === "partial" ? 0.5 : 0), 0);
  return { score, total: passage.questions.length, answers };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
interface SessionRow {
  id: string;
  assessment_id: string;
  student_id: string;
  audio_url: null;
  transcript: string;
  duration_seconds: number;
  status: "complete";
  scores_json: Record<string, unknown>;
  teacher_review_status: string;
  passage_id: string;
  passage_index: number;
  created_at: string;
  scored_at: string;
}

function buildSession(
  assessmentId: string, studentId: string, profile: StudentProfile,
  passage: Passage, passageIndex: number, createdAt: Date
): { session: SessionRow; events: SessionEvent[] } {
  const wcpmTarget = Math.round(jitter(profile.wcpm, 5));
  const { events, duration } = simulateRead(passage, profile, wcpmTarget);
  const metrics = calculateMetrics(events, duration);
  const patterns = computeErrorPatterns(events);
  const comprehension = makeComprehension(passage, profile.comp);
  const confs = events.filter((e) => e.confidence_score !== null).map((e) => e.confidence_score!);
  const avgConfidence = Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100);
  const gradeForNorms: 4 | 5 | 6 | 7 =
    passage.reading_level <= 4 ? 4 : passage.reading_level === 5 ? 5 : (passage.reading_level as 6 | 7);
  const norms = { 4: { p50: 120, p25: 93 }, 5: { p50: 133, p25: 109 }, 6: { p50: 145, p25: 116 }, 7: { p50: 136, p25: 109 } }[gradeForNorms]!;
  const band = metrics.wcpm >= norms.p50 ? "at" : metrics.wcpm >= norms.p25 ? "below" : "well_below";

  const transcript = events
    .filter((e) => e.spoken_word !== null)
    .map((e) => e.spoken_word)
    .join(" ");

  const scores_json = {
    metrics,
    prosody: { level: profile.prosody, ...PROSODY_BANK[profile.prosody] },
    comprehension,
    summary: makeSummary(
      profile, metrics.wcpm, metrics.accuracy_percent, band,
      patterns[0]?.label ?? null, comprehension.score, comprehension.total
    ),
    error_patterns: patterns,
    avg_confidence: avgConfidence,
    scoring_duration_seconds: Number((8 + rng() * 7).toFixed(1)),
    waveform_peaks: makeWaveform(events, duration),
  };

  return {
    session: {
      id: randomUUID(),
      assessment_id: assessmentId,
      student_id: studentId,
      audio_url: null,
      transcript,
      duration_seconds: duration,
      status: "complete",
      scores_json,
      teacher_review_status: profile.review ?? "new",
      passage_id: passage.id,
      passage_index: passageIndex,
      created_at: createdAt.toISOString(),
      scored_at: new Date(createdAt.getTime() + 45_000).toISOString(),
    },
    events,
  };
}

async function insertChunked(table: string, rows: Record<string, unknown>[], chunk = 1500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  }
}

/**
 * A school-day timestamp inside the dashboard's CURRENT week window.
 *
 * The dashboard's "this week" filter starts on SUNDAY (see
 * app/dashboard/client.tsx: startOfWeek = today - getDay()), so anchor to that
 * same Sunday — anchoring to ISO Monday made every seeded session fall into
 * the dashboard's *previous* week when run on a Sunday, leaving the default
 * view empty. Offsets are school days from Monday; any slot that would land
 * in the future is pulled back to earlier today (preserving order), so the
 * window always shows the sessions no matter which day the seed runs.
 */
function weekday(dayOffsetFromMonday: number, hour: number, minute: number): Date {
  const now = new Date();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  sunday.setDate(sunday.getDate() - sunday.getDay()); // dashboard week start
  const d = new Date(sunday);
  d.setDate(sunday.getDate() + 1 + dayOffsetFromMonday); // Monday + offset
  d.setHours(hour, minute, 0, 0);
  if (d > now) {
    // Not reached yet this week — compress into earlier today, keeping the
    // original day/hour ordering (offset 0 earliest).
    const fallback = new Date(now.getTime() - (6 - dayOffsetFromMonday) * 60 * 60 * 1000 - (60 - minute) * 60 * 1000);
    return fallback;
  }
  return d;
}

async function reset() {
  const { data: school } = await supabase.from("schools").select("id").eq("name", SCHOOL_NAME).maybeSingle();
  if (!school) return;
  const { data: assessments } = await supabase.from("assessments").select("id").eq("school_id", school.id);
  const assessmentIds = (assessments ?? []).map((a) => a.id);
  if (assessmentIds.length) {
    const { data: sessions } = await supabase.from("sessions").select("id").in("assessment_id", assessmentIds);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    for (const table of ["session_events", "session_teacher_notes", "comprehension_answers", "session_event_overrides"]) {
      if (sessionIds.length) await supabase.from(table).delete().in("session_id", sessionIds);
    }
    if (sessionIds.length) await supabase.from("sessions").delete().in("id", sessionIds);
    await supabase.from("assessments").delete().in("id", assessmentIds);
  }
  await supabase.from("students").delete().eq("school_id", school.id);
  const { data: teachers } = await supabase.from("teachers").select("id, auth_provider_id").eq("school_id", school.id);
  for (const t of teachers ?? []) {
    if (t.auth_provider_id) await supabase.auth.admin.deleteUser(t.auth_provider_id).catch(() => {});
  }
  await supabase.from("teachers").delete().eq("school_id", school.id);
  await supabase.from("schools").delete().eq("id", school.id);
  console.log("Existing demo school removed.");
}

async function main() {
  const doReset = process.argv.includes("--reset");
  const { data: existing } = await supabase.from("schools").select("id").eq("name", SCHOOL_NAME).maybeSingle();
  if (existing && !doReset) {
    console.error(`"${SCHOOL_NAME}" already exists. Re-run with --reset to delete and recreate.`);
    process.exit(1);
  }
  if (existing) await reset();

  // School + auth user + teacher
  const schoolId = randomUUID();
  const { error: schoolErr } = await supabase.from("schools").insert({ id: schoolId, name: SCHOOL_NAME, district: "NYC Geographic District (Demo)" });
  if (schoolErr) throw new Error(schoolErr.message);

  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
    email_confirm: true,
  });
  if (authErr) throw new Error(`auth user: ${authErr.message}`);

  const teacherId = randomUUID();
  const { error: teacherErr } = await supabase.from("teachers").insert({
    id: teacherId, school_id: schoolId, email: TEACHER_EMAIL,
    full_name: TEACHER_NAME, auth_provider_id: authUser.user.id,
  });
  if (teacherErr) throw new Error(teacherErr.message);

  // Students
  const allProfiles = [...PERIOD_2, ...PERIOD_4, ...PROGRESS];
  const studentIds = new Map<StudentProfile, string>();
  await insertChunked("students", allProfiles.map((p) => {
    const id = randomUUID();
    studentIds.set(p, id);
    return { id, school_id: schoolId, first_name: p.first, last_name: p.last, grade: "6" };
  }));

  // Assessments
  const level5Set = ["L5-A-deepocean", "L5-B-basketball", "L5-C-memory"];
  const level4Set = ["L4-A-mars", "L4-B-bridge", "L4-C-wolves"];
  const mkAssessment = (label: string, level: number, ids: string[], mode: string) => ({
    id: randomUUID(), school_id: schoolId, teacher_id: teacherId,
    passage_id: null, passage_ids: ids, class_label: label,
    share_token: `demo-${randomUUID().slice(0, 12)}`, mode,
    reading_level: level, assessment_period: "MOY" as const,
  });
  const p2 = mkAssessment("Period 2 ELA — MOY Fluency Screening", 5, level5Set, "screening");
  const p4 = mkAssessment("Period 4 ELA — MOY Fluency Screening", 4, level4Set, "screening");
  const pmA = mkAssessment("Progress Check — Intervention Group", 4, ["L4-A-mars"], "progress_monitoring");
  const { error: aErr } = await supabase.from("assessments").insert([p2, p4, pmA]);
  if (aErr) throw new Error(aErr.message);

  // Sessions + events
  const sessionRows: SessionRow[] = [];
  const eventRows: Record<string, unknown>[] = [];
  const noteRows: Record<string, unknown>[] = [];

  const build = (
    profile: StudentProfile, assessment: { id: string; passage_ids: string[] },
    when: Date, passagesRead: number
  ) => {
    for (let i = 0; i < passagesRead; i++) {
      const passage = getPassageById(assessment.passage_ids[i]);
      if (!passage) throw new Error(`missing passage ${assessment.passage_ids[i]}`);
      const at = new Date(when.getTime() + i * (4 + rng() * 3) * 60_000);
      const { session, events } = buildSession(assessment.id, studentIds.get(profile)!, profile, passage, i, at);
      sessionRows.push(session);
      for (const e of events) {
        eventRows.push({ id: randomUUID(), session_id: session.id, ...e });
      }
      if (i === 0 && profile.note) {
        noteRows.push({ session_id: session.id, teacher_id: teacherId, note_text: profile.note });
      }
    }
  };

  // Period 2 read Tue + Wed this week, Period 4 on Thu, progress checks Fri morning
  PERIOD_2.forEach((p, i) => {
    const day = i < 6 ? 1 : 2;
    build(p, p2, weekday(day, 9, 12 + (i % 6) * 16), p.passagesRead ?? 3);
  });
  PERIOD_4.forEach((p, i) => build(p, p4, weekday(3, 13, 5 + i * 17), p.passagesRead ?? 3));
  PROGRESS.forEach((p, i) => build(p, pmA, weekday(4, 8, 40 + i * 22), 1));

  console.log(`Inserting ${sessionRows.length} sessions, ${eventRows.length} events...`);
  await insertChunked("sessions", sessionRows as unknown as Record<string, unknown>[]);
  await insertChunked("session_events", eventRows);
  if (noteRows.length) await insertChunked("session_teacher_notes", noteRows);

  // Verify
  const { count } = await supabase.from("sessions").select("id", { count: "exact", head: true }).in("assessment_id", [p2.id, p4.id, pmA.id]);
  console.log("");
  console.log("Seed complete.");
  console.log(`  School:    ${SCHOOL_NAME}`);
  console.log(`  Login:     ${TEACHER_EMAIL} / ${TEACHER_PASSWORD}`);
  console.log(`  Students:  ${allProfiles.length}  Sessions: ${count}`);
  console.log(`  Classes:   Period 2 (Level 5, median-of-3) · Period 4 (Level 4, median-of-3) · Progress checks`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
