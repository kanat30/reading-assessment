import { createClient } from "@/lib/supabase/server";
import { SessionReport } from "@/components/SessionReport";

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

  if (error || !session) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <p className="font-serif text-xl text-ink italic">Reading not found.</p>
      </div>
    );
  }

  // Check if scoring is still in progress
  if (session.status === "pending" || session.status === "processing") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <div className="w-12 h-12 border-2 border-mist border-t-accent-blue rounded-full animate-spin mb-6" />
        <p className="font-serif text-xl text-ink">Analyzing reading...</p>
        <p className="text-sm text-stone mt-2">This usually takes 10-30 seconds.</p>
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(() => window.location.reload(), 5000);`,
          }}
        />
      </div>
    );
  }

  // Check if scoring failed
  if (session.status === "failed") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic mb-4">
          Unable to analyze this reading.
        </p>
        <p className="text-sm text-stone">Please try recording again.</p>
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
