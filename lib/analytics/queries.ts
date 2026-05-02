import { SupabaseClient } from "@supabase/supabase-js";
import {
  OverrideAnalytics,
  WcpmOverrideStats,
  ProsodyOverrideStats,
  SummaryOverrideStats,
  SchoolOverrideStats,
} from "./types";

/**
 * Fetch override analytics
 *
 * @param supabase - Supabase client (use adminClient for system-wide, regular client for school-scoped)
 * @param options - Query options
 */
export async function fetchOverrideAnalytics(
  supabase: SupabaseClient,
  options: {
    startDate?: string;
    endDate?: string;
    schoolId?: string; // Filter to specific school
    includeSchoolBreakdown?: boolean; // Include per-school stats (admin only)
  } = {}
): Promise<OverrideAnalytics> {
  const {
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Default: last 90 days
    endDate = new Date().toISOString(),
    schoolId,
    includeSchoolBreakdown = false,
  } = options;

  // Build base query for overrides with session and assessment data
  let overridesQuery = supabase
    .from("session_overrides")
    .select(`
      id,
      session_id,
      teacher_id,
      field_name,
      original_value,
      new_value,
      reason,
      created_at,
      sessions!inner (
        id,
        scores_json,
        assessments!inner (
          school_id,
          schools (
            name
          )
        )
      ),
      teachers (
        full_name
      )
    `)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false });

  // Apply school filter if provided
  if (schoolId) {
    overridesQuery = overridesQuery.eq("sessions.assessments.school_id", schoolId);
  }

  const { data: overrides, error: overridesError } = await overridesQuery;

  if (overridesError) {
    console.error("Error fetching overrides:", overridesError);
    throw new Error(`Failed to fetch overrides: ${overridesError.message}`);
  }

  // Get total sessions count for the period
  let sessionsQuery = supabase
    .from("sessions")
    .select("id, assessments!inner(school_id)", { count: "exact", head: true })
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .eq("status", "complete");

  if (schoolId) {
    sessionsQuery = sessionsQuery.eq("assessments.school_id", schoolId);
  }

  const { count: totalSessions } = await sessionsQuery;

  // Process overrides into categories
  const wcpmOverrides: Array<{ original: number; new: number; avgConfidence: number }> = [];
  const prosodyOverrides: Array<{ dimension: string; original: number; new: number }> = [];
  const summaryOverrides: Array<{ original: string; new: string }> = [];
  const schoolStats: Map<string, {
    school_id: string;
    school_name: string;
    wcpm: number[];
    prosody: number;
    total: number;
  }> = new Map();

  for (const override of overrides || []) {
    const sessions = override.sessions as unknown as {
      scores_json: { avg_confidence?: number };
      assessments: { school_id: string; schools: { name: string } };
    };
    const schoolId = sessions?.assessments?.school_id;
    const schoolName = sessions?.assessments?.schools?.name || "Unknown";
    const avgConfidence = sessions?.scores_json?.avg_confidence || 0;

    // Track per-school stats
    if (includeSchoolBreakdown && schoolId) {
      if (!schoolStats.has(schoolId)) {
        schoolStats.set(schoolId, {
          school_id: schoolId,
          school_name: schoolName,
          wcpm: [],
          prosody: 0,
          total: 0,
        });
      }
      const stats = schoolStats.get(schoolId)!;
      stats.total++;
    }

    if (override.field_name === "wcpm") {
      const original = Number(override.original_value);
      const newVal = Number(override.new_value);
      if (!isNaN(original) && !isNaN(newVal)) {
        wcpmOverrides.push({ original, new: newVal, avgConfidence });

        if (includeSchoolBreakdown && schoolId) {
          schoolStats.get(schoolId)!.wcpm.push(newVal - original);
        }
      }
    } else if (override.field_name.startsWith("prosody.")) {
      const dimension = override.field_name.replace("prosody.", "");
      const original = Number(override.original_value);
      const newVal = Number(override.new_value);
      if (!isNaN(original) && !isNaN(newVal)) {
        prosodyOverrides.push({ dimension, original, new: newVal });

        if (includeSchoolBreakdown && schoolId) {
          schoolStats.get(schoolId)!.prosody++;
        }
      }
    } else if (override.field_name === "summary") {
      summaryOverrides.push({
        original: String(override.original_value),
        new: String(override.new_value),
      });
    }
  }

  // Calculate WCPM stats
  const wcpmStats = calculateWcpmStats(wcpmOverrides);

  // Calculate prosody stats
  const prosodyStats = calculateProsodyStats(prosodyOverrides);

  // Calculate summary stats
  const summaryStats: SummaryOverrideStats = {
    total_overrides: summaryOverrides.length,
  };

  // Get unique sessions with overrides
  const sessionsWithOverrides = new Set((overrides || []).map(o => o.session_id)).size;

  // Build school breakdown if requested
  let bySchool: SchoolOverrideStats[] | undefined;
  if (includeSchoolBreakdown) {
    bySchool = Array.from(schoolStats.values()).map(stats => ({
      school_id: stats.school_id,
      school_name: stats.school_name,
      total_overrides: stats.total,
      wcpm_overrides: stats.wcpm.length,
      prosody_overrides: stats.prosody,
      avg_wcpm_adjustment: stats.wcpm.length > 0
        ? stats.wcpm.reduce((a, b) => a + b, 0) / stats.wcpm.length
        : 0,
    })).sort((a, b) => b.total_overrides - a.total_overrides);
  }

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    total_sessions: totalSessions || 0,
    sessions_with_overrides: sessionsWithOverrides,
    override_rate: totalSessions ? (sessionsWithOverrides / totalSessions) * 100 : 0,
    wcpm: wcpmStats,
    prosody: prosodyStats,
    summary: summaryStats,
    by_school: bySchool,
  };
}

function calculateWcpmStats(
  overrides: Array<{ original: number; new: number; avgConfidence: number }>
): WcpmOverrideStats {
  if (overrides.length === 0) {
    return {
      total_overrides: 0,
      avg_adjustment: 0,
      adjustments_up: 0,
      adjustments_down: 0,
      avg_original: 0,
      avg_corrected: 0,
      low_confidence_overrides: 0,
      high_confidence_overrides: 0,
    };
  }

  const adjustments = overrides.map(o => o.new - o.original);
  const avgAdjustment = adjustments.reduce((a, b) => a + b, 0) / adjustments.length;
  const adjustmentsUp = adjustments.filter(a => a > 0).length;
  const adjustmentsDown = adjustments.filter(a => a < 0).length;

  const avgOriginal = overrides.reduce((a, o) => a + o.original, 0) / overrides.length;
  const avgCorrected = overrides.reduce((a, o) => a + o.new, 0) / overrides.length;

  const lowConfidenceOverrides = overrides.filter(o => o.avgConfidence < 0.75).length;
  const highConfidenceOverrides = overrides.filter(o => o.avgConfidence >= 0.85).length;

  return {
    total_overrides: overrides.length,
    avg_adjustment: Math.round(avgAdjustment * 10) / 10,
    adjustments_up: adjustmentsUp,
    adjustments_down: adjustmentsDown,
    avg_original: Math.round(avgOriginal),
    avg_corrected: Math.round(avgCorrected),
    low_confidence_overrides: lowConfidenceOverrides,
    high_confidence_overrides: highConfidenceOverrides,
  };
}

function calculateProsodyStats(
  overrides: Array<{ dimension: string; original: number; new: number }>
): ProsodyOverrideStats {
  const dimensions = ["expression", "phrasing", "smoothness", "pace", "level"];
  const byDimension: ProsodyOverrideStats["by_dimension"] = {
    expression: { count: 0, avg_adjustment: 0 },
    phrasing: { count: 0, avg_adjustment: 0 },
    smoothness: { count: 0, avg_adjustment: 0 },
    pace: { count: 0, avg_adjustment: 0 },
    level: { count: 0, avg_adjustment: 0 },
  };

  for (const dim of dimensions) {
    const dimOverrides = overrides.filter(o => o.dimension === dim);
    if (dimOverrides.length > 0) {
      const adjustments = dimOverrides.map(o => o.new - o.original);
      byDimension[dim as keyof typeof byDimension] = {
        count: dimOverrides.length,
        avg_adjustment: Math.round((adjustments.reduce((a, b) => a + b, 0) / adjustments.length) * 10) / 10,
      };
    }
  }

  return {
    total_overrides: overrides.length,
    by_dimension: byDimension,
  };
}
