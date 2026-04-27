import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateQuestions } from "@/lib/scoring/questions";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { passage_id } = body as { passage_id: string };

    if (!passage_id) {
      return NextResponse.json(
        { error: "Missing passage_id" },
        { status: 400 }
      );
    }

    // Get passage details
    const { data: passage, error: passageError } = await supabase
      .from("passages")
      .select("id, title, text, grade_band")
      .eq("id", passage_id)
      .single();

    if (passageError || !passage) {
      return NextResponse.json(
        { error: "Passage not found" },
        { status: 404 }
      );
    }

    // Generate questions using Claude
    const questions = await generateQuestions(
      passage.title,
      passage.text,
      passage.grade_band
    );

    return NextResponse.json({
      passage_id,
      questions,
    });
  } catch (error) {
    console.error("Generate questions API error:", error);
    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
