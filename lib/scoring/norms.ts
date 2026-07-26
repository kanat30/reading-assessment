/**
 * Norm-set resolution — the ONE place grade + period are turned into a
 * Hasbrouck-Tindal norm set.
 *
 * Policy (DECISIONS 2026-07-26): passages are routed by reading level, but
 * benchmark banding and percentiles use the STUDENT'S grade + assessment
 * period. H-T norms are grade norms; expert validators hand-score by student
 * grade, so passage-level banding would produce apparent mismatches on
 * identical WCPM. When the student's grade was not captured (older
 * assessments), we fall back to estimating a grade from the passage level and
 * say so on every surface ("Norms basis estimated from passage level").
 *
 * The resolved set is computed once at score time, stored in
 * `scores_json.norms`, and every surface (report header/band, group median,
 * print view, AI-summary prompt) renders from that stored object. No surface
 * may re-derive grade/period on its own.
 */

import {
  HASBROUCK_TINDAL_NORMS,
  ReadingLevel,
  AssessmentPeriod,
  BenchmarkBand,
} from "../passages/library";

export type NormGrade = 4 | 5 | 6 | 7 | 8;

export interface NormCuts {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export type NormBasis =
  | "student_grade" // grade captured at assessment creation — the intended path
  | "estimated_from_level" // legacy fallback: grade inferred from passage level
  | "default"; // nothing recorded at all (oldest legacy sessions): grade 6 EOY

export interface ResolvedNorms {
  grade: NormGrade;
  period: AssessmentPeriod;
  basis: NormBasis;
  /** Which published table the cuts come from (2017 update stops at grade 6). */
  table_edition: "2017" | "2006";
  /** The passage difficulty level actually read (routing), for display alongside. */
  passage_level: ReadingLevel | null;
  cuts: NormCuts;
}

/**
 * Estimate a student grade from passage difficulty when the assessment predates
 * the student_grade field. Levels are labeled by the grade whose on-grade
 * passages they hold (Level 5 = on-grade 6th ... Level 7 = on-grade 8th), so the
 * label grade is the best available estimate of the student's grade. Levels 3-4
 * are below-grade routing levels for middle schoolers; grade 4 norms are the
 * closest published set to that reading profile.
 */
const LEVEL_TO_ESTIMATED_GRADE: Record<ReadingLevel, NormGrade> = {
  3: 4,
  4: 4,
  5: 6,
  6: 7,
  7: 8,
};

export function resolveNorms(input: {
  studentGrade: number | null | undefined;
  readingLevel: number | null | undefined;
  period: string | null | undefined;
}): ResolvedNorms {
  const period: AssessmentPeriod =
    input.period === "BOY" || input.period === "MOY" || input.period === "EOY"
      ? input.period
      : "EOY";

  let grade: NormGrade;
  let basis: NormBasis;

  if (
    typeof input.studentGrade === "number" &&
    input.studentGrade >= 4 &&
    input.studentGrade <= 8
  ) {
    grade = input.studentGrade as NormGrade;
    basis = "student_grade";
  } else if (
    typeof input.readingLevel === "number" &&
    input.readingLevel >= 3 &&
    input.readingLevel <= 7
  ) {
    grade = LEVEL_TO_ESTIMATED_GRADE[input.readingLevel as ReadingLevel];
    basis = "estimated_from_level";
  } else {
    grade = 6;
    basis = "default";
  }

  const passage_level =
    typeof input.readingLevel === "number" &&
    input.readingLevel >= 3 &&
    input.readingLevel <= 7
      ? (input.readingLevel as ReadingLevel)
      : null;

  return {
    grade,
    period,
    basis,
    table_edition: grade <= 6 ? "2017" : "2006",
    passage_level,
    cuts: HASBROUCK_TINDAL_NORMS[grade][period],
  };
}

/**
 * Read a stored `scores_json.norms` object back, tolerating older shapes.
 * Returns null when the session predates norm storage (callers then resolve
 * from assessment fields via resolveNorms and the basis label stays honest).
 */
export function parseStoredNorms(value: unknown): ResolvedNorms | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ResolvedNorms>;
  if (
    typeof v.grade !== "number" ||
    !v.period ||
    !v.cuts ||
    typeof v.cuts.p50 !== "number" ||
    typeof v.cuts.p25 !== "number"
  ) {
    return null;
  }
  return v as ResolvedNorms;
}

/** The single band rule: >= p50 At/Above, >= p25 Below, else Well Below. */
export function getBand(wcpm: number, cuts: Pick<NormCuts, "p25" | "p50">): BenchmarkBand {
  if (wcpm >= cuts.p50) return "at";
  if (wcpm >= cuts.p25) return "below";
  return "well_below";
}

/** The single band vocabulary: At/Above · Below · Well Below Benchmark. */
export function getBandLabel(band: BenchmarkBand): string {
  switch (band) {
    case "at":
      return "At/Above Benchmark";
    case "below":
      return "Below Benchmark";
    case "well_below":
      return "Well Below Benchmark";
  }
}

const CUT_ORDER: Array<{ key: keyof NormCuts; percentile: number }> = [
  { key: "p10", percentile: 10 },
  { key: "p25", percentile: 25 },
  { key: "p50", percentile: 50 },
  { key: "p75", percentile: 75 },
  { key: "p90", percentile: 90 },
];

export interface PercentileRange {
  /** Set when the WCPM lands exactly on a published cut. */
  exact: number | null;
  /** Published cut just below the WCPM (null = below the 10th). */
  lower: number | null;
  /** Published cut just above the WCPM (null = above the 90th). */
  upper: number | null;
}

/**
 * Locate a WCPM against the published cuts. The tables define exactly five
 * points; anything between them is reported as a range — never interpolated
 * into a fabricated point estimate.
 */
export function getPercentileRange(wcpm: number, cuts: NormCuts): PercentileRange {
  let lower: number | null = null;
  for (const { key, percentile } of CUT_ORDER) {
    if (wcpm === cuts[key]) return { exact: percentile, lower: null, upper: null };
    if (wcpm > cuts[key]) {
      lower = percentile;
    } else {
      return { exact: null, lower, upper: percentile };
    }
  }
  return { exact: null, lower, upper: null };
}

/** Human sentence fragment, e.g. "between the 25th and 50th percentiles". */
export function describePercentile(wcpm: number, cuts: NormCuts): string {
  const range = getPercentileRange(wcpm, cuts);
  if (range.exact !== null) return `at the ${ordinal(range.exact)} percentile`;
  if (range.lower === null) return `below the ${ordinal(range.upper!)} percentile`;
  if (range.upper === null) return `above the ${ordinal(range.lower)} percentile`;
  return `between the ${ordinal(range.lower)} and ${ordinal(range.upper)} percentiles`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The grade whose on-grade passages a level holds (Level 5 = on-grade 6th ...).
 * Levels 3-4 are below-grade routing levels (~3rd-5th grade reading).
 */
const LEVEL_ON_GRADE: Record<ReadingLevel, number> = { 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 };

/**
 * D1 display rule: when the passage read sits below the student's grade, say
 * both facts plainly — e.g. "Passage: Level 5 (below grade level) ·
 * Benchmarked against Grade 6 norms (Middle of Year)". Returns null when
 * there is no passage level to compare.
 */
export function describePassageVsGrade(norms: ResolvedNorms): string | null {
  if (norms.passage_level == null) return null;
  const periodLabel =
    norms.period === "BOY"
      ? "Beginning of Year"
      : norms.period === "MOY"
      ? "Middle of Year"
      : "End of Year";
  const belowGrade = LEVEL_ON_GRADE[norms.passage_level] < norms.grade;
  return `Passage: Level ${norms.passage_level}${belowGrade ? " (below grade level)" : ""} · Benchmarked against Grade ${norms.grade} norms (${periodLabel})`;
}

/** "Grade 6 norms (Middle of Year, 2017 edition)" — the one caption format. */
export function describeNormsBasis(norms: ResolvedNorms): {
  caption: string;
  basisNote: string | null;
} {
  const periodLabel =
    norms.period === "BOY"
      ? "Beginning of Year"
      : norms.period === "MOY"
      ? "Middle of Year"
      : "End of Year";
  return {
    caption: `Hasbrouck–Tindal Grade ${norms.grade} norms (${periodLabel}, ${norms.table_edition} edition)`,
    basisNote:
      norms.basis === "student_grade"
        ? null
        : norms.basis === "estimated_from_level"
        ? "Norms basis estimated from passage level — student grade was not recorded for this assessment."
        : "Norms basis defaulted to Grade 6, End of Year — neither student grade nor passage level was recorded.",
  };
}
