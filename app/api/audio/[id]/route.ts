/**
 * Audio streaming route - serves audio from Supabase Storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Look up session to get audio_url
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("audio_url")
      .eq("id", id)
      .single();

    if (sessionError || !session?.audio_url) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Download audio from Supabase Storage
    const { data, error: downloadError } = await supabase.storage
      .from("recordings")
      .download(session.audio_url);

    if (downloadError || !data) {
      console.error("Error downloading audio:", downloadError);
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await data.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    // Check for Range header (needed for seeking)
    const range = request.headers.get("range");

    if (range) {
      // Parse range header: "bytes=start-end"
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      // Slice the buffer for the requested range
      const chunk = arrayBuffer.slice(start, end + 1);

      return new NextResponse(chunk, {
        status: 206, // Partial Content
        headers: {
          "Content-Type": "audio/webm",
          "Content-Length": chunkSize.toString(),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    // No range requested - return full file
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "audio/webm",
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Audio route error:", error);
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }
}
