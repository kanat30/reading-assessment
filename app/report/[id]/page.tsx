import { createClient } from "@/lib/supabase/server";
import { SessionReport } from "@/components/SessionReport";
import { ReportSkeleton } from "@/components/skeletons/ReportSkeleton";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Quick check that session exists and is complete
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", id)
    .single();

  // Not found - calm serif design
  if (error || !session) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center">
          Reading not found.
        </p>
      </div>
    );
  }

  // Processing - show skeleton instead of spinner
  if (session.status === "pending" || session.status === "processing") {
    return (
      <div className="min-h-screen bg-paper">
        <div className="max-w-[720px] mx-auto px-6 py-12">
          <ReportSkeleton />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(() => window.location.reload(), 5000);`,
          }}
        />
      </div>
    );
  }

  // Scoring failed - calm serif design
  if (session.status === "failed") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center mb-4">
          This reading could not be scored.
        </p>
        <p className="text-sm text-stone text-center">
          The audio may have been too quiet or unclear.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <SessionReport sessionId={id} />
      </div>
    </div>
  );
}
