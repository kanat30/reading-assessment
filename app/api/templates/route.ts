import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface QuestionInput {
  question: string;
  question_type: "literal" | "inferential";
}

// GET - List templates for current teacher's school
export async function GET() {
  const supabase = await createClient();

  // Get current user's teacher record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("school_id")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  // Fetch templates with passage details
  const { data: templates, error } = await supabase
    .from("assessment_templates")
    .select(`
      id,
      name,
      passage_id,
      questions,
      created_at,
      passages(id, title, grade_band, word_count)
    `)
    .eq("school_id", teacher.school_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }

  return NextResponse.json({ templates: templates || [] });
}

// POST - Create a new template
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { name, passage_id, questions } = body as {
      name: string;
      passage_id: string;
      questions: QuestionInput[];
    };

    // Validate inputs
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 }
      );
    }

    if (!passage_id) {
      return NextResponse.json(
        { error: "Passage is required" },
        { status: 400 }
      );
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: "At least one question is required" },
        { status: 400 }
      );
    }

    // Get current user's teacher record
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, school_id")
      .eq("auth_provider_id", user.id)
      .single();

    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    // Create the template
    const { data: template, error } = await supabase
      .from("assessment_templates")
      .insert({
        school_id: teacher.school_id,
        teacher_id: teacher.id,
        name: name.trim(),
        passage_id,
        questions,
      })
      .select(`
        id,
        name,
        passage_id,
        questions,
        created_at,
        passages(id, title, grade_band, word_count)
      `)
      .single();

    if (error) {
      console.error("Error creating template:", error);
      return NextResponse.json(
        { error: "Failed to create template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Templates API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

// PATCH - Update a template (name only)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { id, name } = body as { id: string; name: string };

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 }
      );
    }

    // Get current user's teacher record
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("auth_provider_id", user.id)
      .single();

    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    // Update the template (only own templates can be updated)
    const { data: template, error } = await supabase
      .from("assessment_templates")
      .update({ name: name.trim() })
      .eq("id", id)
      .eq("teacher_id", teacher.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating template:", error);
      return NextResponse.json(
        { error: "Failed to update template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Templates API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a template
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("id");

    if (!templateId) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    // Get current user's teacher record
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("auth_provider_id", user.id)
      .single();

    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    // Delete the template (RLS ensures only own templates can be deleted)
    const { error } = await supabase
      .from("assessment_templates")
      .delete()
      .eq("id", templateId)
      .eq("teacher_id", teacher.id);

    if (error) {
      console.error("Error deleting template:", error);
      return NextResponse.json(
        { error: "Failed to delete template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Templates API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
