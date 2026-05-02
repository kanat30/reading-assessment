/**
 * Analytics Types
 * Type definitions for override analytics and AI calibration recommendations
 */

// Raw override record from database
export interface OverrideRecord {
  id: string;
  session_id: string;
  teacher_id: string;
  field_name: string;
  original_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
  // Joined data
  school_id?: string;
  school_name?: string;
  teacher_name?: string;
  avg_confidence?: number;
}

// Aggregated WCPM override statistics
export interface WcpmOverrideStats {
  total_overrides: number;
  avg_adjustment: number; // new - original (positive = teachers rate higher)
  adjustments_up: number;
  adjustments_down: number;
  avg_original: number;
  avg_corrected: number;
  // Breakdown by confidence ranges
  low_confidence_overrides: number; // sessions with avg_confidence < 0.75
  high_confidence_overrides: number; // sessions with avg_confidence >= 0.85
}

// Prosody override statistics
export interface ProsodyOverrideStats {
  total_overrides: number;
  by_dimension: {
    expression: { count: number; avg_adjustment: number };
    phrasing: { count: number; avg_adjustment: number };
    smoothness: { count: number; avg_adjustment: number };
    pace: { count: number; avg_adjustment: number };
    level: { count: number; avg_adjustment: number };
  };
}

// Summary override statistics
export interface SummaryOverrideStats {
  total_overrides: number;
  // Could add sentiment analysis later
}

// Overall analytics summary
export interface OverrideAnalytics {
  period: {
    start: string;
    end: string;
  };
  total_sessions: number;
  sessions_with_overrides: number;
  override_rate: number; // percentage
  wcpm: WcpmOverrideStats;
  prosody: ProsodyOverrideStats;
  summary: SummaryOverrideStats;
  // Per-school breakdown (admin only)
  by_school?: SchoolOverrideStats[];
}

export interface SchoolOverrideStats {
  school_id: string;
  school_name: string;
  total_overrides: number;
  wcpm_overrides: number;
  prosody_overrides: number;
  avg_wcpm_adjustment: number;
}

// AI calibration recommendation
export interface CalibrationRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  category: "wcpm" | "prosody" | "confidence" | "general";
  title: string;
  description: string;
  current_value?: string | number;
  suggested_value?: string | number;
  evidence: string; // e.g., "Based on 47 overrides with avg +6.2 adjustment"
  confidence: number; // 0-1, how confident we are in this recommendation
}

// Full analytics report with recommendations
export interface AnalyticsReport {
  generated_at: string;
  analytics: OverrideAnalytics;
  recommendations: CalibrationRecommendation[];
}
