import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface OverrideRequest {
  session_id: string;
  field_name: string;
  original_value: unknown;
  new_value: unknown;
  reason?: string;
}

/**
 * POST /api/override
 * Apply a teacher override to a session field.
 * Uses the apply_session_override database function for atomicity.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body: OverrideRequest = await request.json();
    const { session_id, field_name, original_value, new_value, reason } = body;

    // Validate required fields
    if (!session_id || !field_name || original_value === undefined || new_value === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Call the atomic override function
    const { data, error } = await supabase.rpc("apply_session_override", {
      p_session_id: session_id,
      p_field_name: field_name,
      p_original_value: JSON.stringify(original_value),
      p_new_value: JSON.stringify(new_value),
      p_reason: reason || null,
    });

    if (error) {
      console.error("Override error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ override_id: data });
  } catch (error) {
    console.error("Override API error:", error);
    return NextResponse.json(
      { error: "Failed to apply override" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/override?session_id=xxx
 * Get all overrides for a session.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id parameter" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("session_overrides")
    .select(`
      id,
      field_name,
      original_value,
      new_value,
      reason,
      created_at,
      teachers(full_name)
    `)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Get overrides error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ overrides: data });
}
