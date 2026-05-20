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
  percentile_estimate: number;
  percentile_band: "above" | "approaching" | "below";
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

// Prosody assessment based on NAEP Oral Reading Fluency Scale
export interface ProsodyScore {
  level: 1 | 2 | 3 | 4;
  expression: string;      // Brief description of expression quality
  phrasing: string;        // Brief description of phrasing patterns
  pace: string;            // Brief description of pace consistency
  explanation: string;     // Overall explanation of the score
}

// Comprehension question and answer
export interface ComprehensionQuestion {
  id: string;
  question: string;
  type: "literal" | "inferential";  // Literal = directly in text, Inferential = requires reasoning
}

export type ComprehensionStatus = "correct" | "partial" | "incorrect";

export interface ComprehensionAnswer {
  question_id: string;
  student_answer: string;
  is_correct: boolean;           // Legacy: true if status is "correct"
  status: ComprehensionStatus;   // "correct" | "partial" | "incorrect"
  feedback: string;
}

export interface ComprehensionResult {
  questions: ComprehensionQuestion[];
  answers: ComprehensionAnswer[];
  score: number;           // Number correct
  total: number;           // Total questions
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
