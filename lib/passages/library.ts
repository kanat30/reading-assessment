/**
 * Passage Library for FluencyScope ORF Assessment
 *
 * Organized by reading level (not grade) to support below-grade routing.
 * Each level has 3 equivalent passages (Forms A, B, C) for the median-of-3 protocol.
 *
 * Reading Levels:
 * - Level 3: 520L-820L (struggling MS readers, ~3rd-4th grade reading)
 * - Level 4: 740L-940L (below-grade MS, ~4th-5th grade reading) - CORE USE CASE
 * - Level 5: 830L-1010L (on-grade 6th)
 * - Level 6: 925L-1070L (on-grade 7th)
 * - Level 7: 970L-1185L (on-grade 8th / advanced)
 */

import { ComprehensionQuestion } from "../scoring/types";
import { LEVEL_3_PASSAGES } from "./level3-passages";
import { LEVEL_4_PASSAGES } from "./level4-passages";
import { LEVEL_5_PASSAGES } from "./level5-passages";
import { LEVEL_6_PASSAGES } from "./level6-passages";
import { LEVEL_7_PASSAGES } from "./level7-passages";

export type ReadingLevel = 3 | 4 | 5 | 6 | 7;
export type PassageForm = "A" | "B" | "C";
export type PassageSource = "public_domain" | "commonlit" | "readworks" | "original";
export type PassageGenre = "fiction" | "nonfiction" | "memoir";

export interface PassageMetadata {
  id: string;
  title: string;
  author: string;
  source: PassageSource;
  lexile: number;
  reading_level: ReadingLevel;
  form: PassageForm;
  word_count: number;
  genre: PassageGenre;
  themes: string[];
  grade_content: string; // Age-appropriate content (e.g., "6-8")
}

export interface Passage extends PassageMetadata {
  text: string;
  questions: ComprehensionQuestion[];
}

/**
 * Hasbrouck-Tindal WCPM Norms — full published percentile cuts (10/25/50/75/90).
 * Used for At/Above · Below · Well Below Benchmark scoring and honest percentile
 * range display (a WCPM between two cuts is reported as a range, never as an
 * interpolated point estimate — the published tables only define these five cuts).
 *
 * Grades 4-6: 2017 compiled norms (Hasbrouck & Tindal, "An Update to Compiled
 * ORF Norms", Technical Report #1702, University of Oregon; eric.ed.gov/?id=ED594994).
 * Grades 7-8: the 2017 update stops at grade 6, so these rows come from the 2006
 * compilation (Hasbrouck & Tindal, The Reading Teacher 59(7), 636-644).
 * All 75 values re-verified against two independent reproductions per grade
 * (readingrockets.org + readnaturally.com, corroborated by district/university
 * documents for grades 7-8) on 2026-07-26.
 */
export const HASBROUCK_TINDAL_NORMS = {
  4: {
    BOY: { p10: 60, p25: 75, p50: 94, p75: 125, p90: 153 },
    MOY: { p10: 71, p25: 95, p50: 120, p75: 143, p90: 168 },
    EOY: { p10: 83, p25: 105, p50: 133, p75: 160, p90: 184 },
  },
  5: {
    BOY: { p10: 64, p25: 87, p50: 121, p75: 153, p90: 179 },
    MOY: { p10: 84, p25: 109, p50: 133, p75: 160, p90: 183 },
    EOY: { p10: 102, p25: 119, p50: 146, p75: 169, p90: 195 },
  },
  6: {
    BOY: { p10: 89, p25: 112, p50: 132, p75: 159, p90: 185 },
    MOY: { p10: 91, p25: 116, p50: 145, p75: 166, p90: 195 },
    EOY: { p10: 91, p25: 122, p50: 146, p75: 173, p90: 204 },
  },
  7: {
    BOY: { p10: 79, p25: 102, p50: 128, p75: 156, p90: 180 },
    MOY: { p10: 88, p25: 109, p50: 136, p75: 165, p90: 192 },
    EOY: { p10: 98, p25: 123, p50: 150, p75: 177, p90: 202 },
  },
  8: {
    BOY: { p10: 77, p25: 106, p50: 133, p75: 161, p90: 185 },
    MOY: { p10: 84, p25: 115, p50: 146, p75: 173, p90: 199 },
    EOY: { p10: 97, p25: 124, p50: 151, p75: 177, p90: 199 },
  },
} as const;

export type AssessmentPeriod = "BOY" | "MOY" | "EOY";
export type BenchmarkBand = "at" | "below" | "well_below";

/**
 * Calculate median of 3 WCPM scores (Acadience protocol)
 */
export function getMedianWCPM(scores: [number, number, number]): number {
  const sorted = [...scores].sort((a, b) => a - b);
  return sorted[1]; // Middle value
}

/**
 * Get passages by reading level
 */
export function getPassagesByLevel(level: ReadingLevel): Passage[] {
  return PASSAGE_LIBRARY.filter((p) => p.reading_level === level);
}

/**
 * Get a specific passage set (all 3 forms for a level)
 */
export function getPassageSet(level: ReadingLevel): {
  A: Passage | undefined;
  B: Passage | undefined;
  C: Passage | undefined;
} {
  const passages = getPassagesByLevel(level);
  return {
    A: passages.find((p) => p.form === "A"),
    B: passages.find((p) => p.form === "B"),
    C: passages.find((p) => p.form === "C"),
  };
}

/**
 * Get a single passage by ID
 */
export function getPassageById(id: string): Passage | undefined {
  return PASSAGE_LIBRARY.find((p) => p.id === id);
}

/**
 * Get reading level label for display
 */
export function getReadingLevelLabel(level: ReadingLevel): string {
  const labels: Record<ReadingLevel, string> = {
    3: "Level 3 (3rd-4th grade)",
    4: "Level 4 (4th-5th grade)",
    5: "Level 5 (6th grade)",
    6: "Level 6 (7th grade)",
    7: "Level 7 (8th grade+)",
  };
  return labels[level];
}

/**
 * Get Lexile range for a reading level
 */
export function getLexileRange(level: ReadingLevel): { min: number; max: number } {
  const ranges: Record<ReadingLevel, { min: number; max: number }> = {
    3: { min: 520, max: 820 },
    4: { min: 740, max: 940 },
    5: { min: 830, max: 1010 },
    6: { min: 925, max: 1070 },
    7: { min: 970, max: 1185 },
  };
  return ranges[level];
}

/**
 * Auto-detect assessment period based on current date
 * BOY: Sep 1 - Nov 15
 * MOY: Nov 16 - Feb 28/29
 * EOY: Mar 1 - Aug 31
 */
export function detectAssessmentPeriod(date: Date = new Date()): AssessmentPeriod {
  const month = date.getMonth(); // 0-11
  const day = date.getDate();

  // Sep (8), Oct (9), Nov 1-15 (10) → BOY
  if (month >= 8 && month <= 9) return "BOY";
  if (month === 10 && day <= 15) return "BOY";

  // Nov 16-30 (10), Dec (11), Jan (0), Feb (1) → MOY
  if (month === 10 && day > 15) return "MOY";
  if (month === 11 || month === 0 || month === 1) return "MOY";

  // Mar (2) through Aug (7) → EOY
  return "EOY";
}

/**
 * Get human-readable period label
 */
export function getAssessmentPeriodLabel(period: AssessmentPeriod): string {
  const labels: Record<AssessmentPeriod, string> = {
    BOY: "Beginning of Year (Sep-Nov)",
    MOY: "Middle of Year (Nov-Feb)",
    EOY: "End of Year (Mar-Aug)",
  };
  return labels[period];
}

// =============================================================================
// COMBINED PASSAGE LIBRARY
// =============================================================================

export const PASSAGE_LIBRARY: Passage[] = [
  ...LEVEL_3_PASSAGES,
  ...LEVEL_4_PASSAGES,
  ...LEVEL_5_PASSAGES,
  ...LEVEL_6_PASSAGES,
  ...LEVEL_7_PASSAGES,
];

// Export for backward compatibility with existing code
export const PASSAGES = PASSAGE_LIBRARY;

// Re-export level-specific arrays for direct access
export {
  LEVEL_3_PASSAGES,
  LEVEL_4_PASSAGES,
  LEVEL_5_PASSAGES,
  LEVEL_6_PASSAGES,
  LEVEL_7_PASSAGES,
};
