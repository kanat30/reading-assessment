import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EventOverrideAction, EventType } from "@/lib/scoring/types";

interface CreateOverrideRequest {
  session_id: string;
  word_index: number;
  action: EventOverrideAction;
  original_event_type: EventType;
  original_confidence?: number | null;
  new_event_type?: EventType | null;
  spoken_word_override?: string | null;
  reason?: string | null;
}

/**
 * POST /api/event-override
 * Create or update a word-level override
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body: CreateOverrideRequest = await request.json();
    const {
      session_id,
      word_index,
      action,
      original_event_type,
      original_confidence,
      new_event_type,
      spoken_word_override,
      reason,
    } = body;

    // Validate required fields
    if (!session_id || word_index === undefined || !action || !original_event_type) {
      return NextResponse.json(
        { error: "Missing required fields: session_id, word_index, action, original_event_type" },
        { status: 400 }
      );
    }

    // Validate action
    if (!["flag_error", "approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'flag_error', 'approve', or 'reject'" },
        { status: 400 }
      );
    }

    // For flag_error, new_event_type is required
    if (action === "flag_error" && !new_event_type) {
      return NextResponse.json(
        { error: "new_event_type is required for flag_error action" },
        { status: 400 }
      );
    }

    // Call the atomic override function
    const { data, error } = await supabase.rpc("apply_event_override", {
      p_session_id: session_id,
      p_word_index: word_index,
      p_action: action,
      p_original_event_type: original_event_type,
      p_original_confidence: original_confidence ?? null,
      p_new_event_type: new_event_type ?? null,
      p_spoken_word_override: spoken_word_override ?? null,
      p_reason: reason ?? null,
    });

    if (error) {
      console.error("Event override error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Event override API error:", error);
    return NextResponse.json(
      { error: "Failed to apply event override" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/event-override?session_id=xxx
 * Get all word-level overrides for a session
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
    .from("session_event_overrides")
    .select(`
      id,
      session_id,
      word_index,
      teacher_id,
      action,
      original_event_type,
      original_confidence,
      new_event_type,
      spoken_word_override,
      reason,
      created_at,
      teachers(full_name)
    `)
    .eq("session_id", sessionId)
    .order("word_index", { ascending: true });

  if (error) {
    console.error("Get event overrides error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ overrides: data });
}

/**
 * DELETE /api/event-override?session_id=xxx&word_index=N
 * Remove a word-level override
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const wordIndex = searchParams.get("word_index");

  if (!sessionId || wordIndex === null) {
    return NextResponse.json(
      { error: "Missing session_id or word_index parameter" },
      { status: 400 }
    );
  }

  // Call the delete function which also recalculates metrics
  const { data, error } = await supabase.rpc("delete_event_override", {
    p_session_id: sessionId,
    p_word_index: parseInt(wordIndex, 10),
  });

  if (error) {
    console.error("Delete event override error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
