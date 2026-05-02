import { OverrideAnalytics, CalibrationRecommendation, AnalyticsReport } from "./types";

/**
 * Generate AI calibration recommendations based on override analytics
 *
 * These recommendations help tune the scoring system based on teacher feedback patterns.
 * All recommendations are computed locally - no student data is sent externally.
 */
export function generateRecommendations(
  analytics: OverrideAnalytics
): CalibrationRecommendation[] {
  const recommendations: CalibrationRecommendation[] = [];

  // ============================================
  // WCPM Recommendations
  // ============================================

  const { wcpm } = analytics;

  // Check if WCPM is systematically under-estimated
  if (wcpm.total_overrides >= 10 && wcpm.avg_adjustment > 5) {
    const confidence = Math.min(wcpm.total_overrides / 50, 1); // More data = higher confidence
    recommendations.push({
      id: "wcpm-underestimate",
      priority: wcpm.avg_adjustment > 10 ? "high" : "medium",
      category: "wcpm",
      title: "WCPM systematically underestimated",
      description: `Teachers are consistently adjusting WCPM scores upward by an average of ${wcpm.avg_adjustment} points. Consider lowering the mispronunciation confidence threshold to count more words as correct.`,
      current_value: "0.80",
      suggested_value: wcpm.avg_adjustment > 10 ? "0.70" : "0.75",
      evidence: `Based on ${wcpm.total_overrides} overrides: ${wcpm.adjustments_up} up, ${wcpm.adjustments_down} down. Average original: ${wcpm.avg_original}, average corrected: ${wcpm.avg_corrected}.`,
      confidence,
    });
  }

  // Check if WCPM is systematically over-estimated
  if (wcpm.total_overrides >= 10 && wcpm.avg_adjustment < -5) {
    const confidence = Math.min(wcpm.total_overrides / 50, 1);
    recommendations.push({
      id: "wcpm-overestimate",
      priority: wcpm.avg_adjustment < -10 ? "high" : "medium",
      category: "wcpm",
      title: "WCPM systematically overestimated",
      description: `Teachers are consistently adjusting WCPM scores downward by an average of ${Math.abs(wcpm.avg_adjustment)} points. Consider raising the mispronunciation confidence threshold to be stricter.`,
      current_value: "0.80",
      suggested_value: "0.85",
      evidence: `Based on ${wcpm.total_overrides} overrides: ${wcpm.adjustments_up} up, ${wcpm.adjustments_down} down.`,
      confidence,
    });
  }

  // Check if low-confidence sessions are being corrected more
  if (wcpm.total_overrides >= 5 && wcpm.low_confidence_overrides > wcpm.high_confidence_overrides * 2) {
    recommendations.push({
      id: "confidence-threshold",
      priority: "medium",
      category: "confidence",
      title: "Low-confidence sessions need attention",
      description: `Sessions with low average confidence scores are being corrected ${Math.round(wcpm.low_confidence_overrides / Math.max(wcpm.high_confidence_overrides, 1))}x more often than high-confidence sessions. The speech recognition may be struggling with certain audio conditions or accents.`,
      evidence: `${wcpm.low_confidence_overrides} corrections in low-confidence sessions (<0.75) vs ${wcpm.high_confidence_overrides} in high-confidence sessions (≥0.85).`,
      confidence: 0.7,
    });
  }

  // ============================================
  // Prosody Recommendations
  // ============================================

  const { prosody } = analytics;

  // Check for systematic prosody bias
  const prosodyDimensions = Object.entries(prosody.by_dimension)
    .filter(([, stats]) => stats.count >= 5)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [dimension, stats] of prosodyDimensions) {
    if (stats.avg_adjustment > 0.5) {
      recommendations.push({
        id: `prosody-${dimension}-underestimate`,
        priority: stats.count >= 20 ? "high" : "medium",
        category: "prosody",
        title: `${capitalize(dimension)} score underestimated`,
        description: `Teachers consistently rate "${dimension}" higher than the AI by an average of ${stats.avg_adjustment} points on the 1-4 scale.`,
        evidence: `Based on ${stats.count} corrections.`,
        confidence: Math.min(stats.count / 30, 1),
      });
    } else if (stats.avg_adjustment < -0.5) {
      recommendations.push({
        id: `prosody-${dimension}-overestimate`,
        priority: stats.count >= 20 ? "high" : "medium",
        category: "prosody",
        title: `${capitalize(dimension)} score overestimated`,
        description: `Teachers consistently rate "${dimension}" lower than the AI by an average of ${Math.abs(stats.avg_adjustment)} points on the 1-4 scale.`,
        evidence: `Based on ${stats.count} corrections.`,
        confidence: Math.min(stats.count / 30, 1),
      });
    }
  }

  // ============================================
  // General Recommendations
  // ============================================

  // High override rate warning
  if (analytics.override_rate > 20 && analytics.sessions_with_overrides >= 10) {
    recommendations.push({
      id: "high-override-rate",
      priority: "high",
      category: "general",
      title: "High override rate detected",
      description: `${analytics.override_rate.toFixed(1)}% of sessions are being corrected by teachers. This suggests the AI scoring may need significant calibration.`,
      evidence: `${analytics.sessions_with_overrides} of ${analytics.total_sessions} sessions have been corrected.`,
      confidence: 0.9,
    });
  }

  // Low data warning
  if (analytics.total_sessions > 50 && analytics.sessions_with_overrides < 5) {
    recommendations.push({
      id: "need-more-feedback",
      priority: "low",
      category: "general",
      title: "Need more teacher feedback",
      description: "Very few sessions have been reviewed by teachers. Encourage teachers to use the 'Disagree with this score?' feature when they notice inaccuracies.",
      evidence: `Only ${analytics.sessions_with_overrides} corrections across ${analytics.total_sessions} sessions.`,
      confidence: 0.5,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

/**
 * Generate a complete analytics report with recommendations
 */
export function generateAnalyticsReport(analytics: OverrideAnalytics): AnalyticsReport {
  return {
    generated_at: new Date().toISOString(),
    analytics,
    recommendations: generateRecommendations(analytics),
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
