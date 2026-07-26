export type EventType = "correct" | "substitution" | "omission" | "insertion" | "self_correction" | "mispronunciation";

export interface SessionEvent {
  word_index: number;
  expected_word: string;
  spoken_word: string | null;
  start_timestamp_ms: number | null;
  end_timestamp_ms: number | null;
  event_type: EventType;
  confidence_score: number | null;
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface ScoringMetrics {
  wcpm: number;
  accuracy_percent: number;
  correct_words: number;
  total_words_attempted: number;
  /**
   * @deprecated Legacy fields from the pre-norms-resolution pipeline (always
   * computed against grade-6 spring norms regardless of the session). Present
   * only in scores_json stored before 2026-07-26; never written anymore.
   * Percentiles now live in scores_json.norms + the honest range helpers in
   * lib/scoring/norms.ts.
   */
  percentile_estimate?: number;
  percentile_band?: "above" | "approaching" | "below";
}

export interface ErrorPattern {
  pattern: string;
  count: number;
  total: number;
}

// Enhanced error pattern interface for Week 5
export interface EnhancedErrorPattern {
  id: string;                    // 'multisyllabic' | 'suffix-tion' | 'function-words' | etc.
  label: string;                 // human-readable
  description: string;           // one short sentence
  matched_words: string[];       // unique expected words that matched
  event_count: number;
}

// Holistic prosody observation based on the NAEP Oral Reading Fluency Scale.
// AI-generated (Claude over timing data) — rendered ONLY inside the AI
// Observation block, labeled as such. Never the prosody score; the score comes
// from the deterministic dimensions below.
export interface ProsodyScore {
  level: 1 | 2 | 3 | 4;
  expression: string;      // Brief description of expression quality
  phrasing: string;        // Brief description of phrasing patterns
  pace: string;            // Brief description of pace consistency
  explanation: string;     // Overall explanation of the score
}

export type ProsodyDimensionValue = 1 | 2 | 3 | 4;

// Deterministic per-dimension prosody (Rasinski MDFS dimensions), computed
// server-side at score time (lib/scoring/prosody.ts) and stored in
// scores_json.prosody_dimensions. Expression cannot be honestly derived from
// ASR timing data, so it is teacher-rated: null until a teacher sets it via
// the override flow. Teacher overrides of any dimension are applied directly
// to this stored object by apply_session_override.
export interface ProsodyDimensions {
  pace: ProsodyDimensionValue;
  smoothness: ProsodyDimensionValue;
  phrasing: ProsodyDimensionValue;
  expression: ProsodyDimensionValue | null;
}

// Comprehension question and answer
export interface ComprehensionQuestion {
  id: string;
  question: string;
  type: "literal" | "inferential";  // Literal = directly in text, Inferential = requires reasoning
}

export type ComprehensionStatus = "correct" | "partial" | "incorrect" | "ungraded";

export interface ComprehensionAnswer {
  question_id: string;
  student_answer: string;
  is_correct: boolean;           // Legacy: true if status is "correct"
  status: ComprehensionStatus;   // "correct" | "partial" | "incorrect"
  feedback: string;
  expected_answer?: string;      // The correct answer or relevant passage excerpt
}

export interface ComprehensionResult {
  questions: ComprehensionQuestion[];
  answers: ComprehensionAnswer[];
  /** Points earned (correct = 1, partial = 0.5). null when grading_status is "ungraded". */
  score: number | null;
  total: number;           // Total questions
  /**
   * "graded" = AI grading succeeded (teacher can still regrade/override).
   * "ungraded" = AI grading failed — answers are preserved, nothing is scored,
   * the report shows a needs-manual-grading state, and aggregates exclude this
   * passage. Never silently zero.
   */
  grading_status: "graded" | "ungraded";
}

export interface ScoredSession {
  session_id: string;
  passage_id: string;
  passage_title: string;
  passage_text: string;
  duration_seconds: number;
  events: SessionEvent[];
  insertions: SessionEvent[];
  metrics: ScoringMetrics;
  prosody: ProsodyScore | null;
  comprehension: ComprehensionResult | null;
  summary: string;
  error_patterns: ErrorPattern[];
  avg_confidence: number;
  scoring_duration_seconds: number;
  created_at: Date;
}

// Event Override Types (for teacher word-level corrections)
export type EventOverrideAction = 'flag_error' | 'approve' | 'reject';

export interface SessionEventOverride {
  id: string;
  session_id: string;
  word_index: number;
  teacher_id: string;
  action: EventOverrideAction;
  original_event_type: EventType;
  original_confidence: number | null;
  new_event_type: EventType | null;
  spoken_word_override: string | null;
  reason: string | null;
  created_at: string;
  teacher?: { full_name: string };
}
