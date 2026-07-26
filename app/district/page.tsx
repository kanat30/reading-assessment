import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PrintButton } from "@/components/marketing/PrintButton";

export const metadata: Metadata = {
  title: "FluencyScope for districts — measurement & compliance",
  description:
    "How FluencyScope measures oral reading fluency, what it deliberately is not, and how it aligns with NYC DOE AI guidance: advisory-only outputs, teacher override, no model training on student data.",
};

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-8 border-t border-mist/60 print:py-4 print:break-inside-avoid">
      <div className="grid sm:grid-cols-[56px_1fr] gap-2 sm:gap-6">
        <p className="font-serif text-2xl text-stone/40 print:text-lg">{n}</p>
        <div>
          <h2 className="font-serif text-2xl text-ink mb-4 print:text-lg print:mb-2">
            {title}
          </h2>
          <div className="space-y-4 text-[15px] text-ink/85 leading-relaxed print:text-[12px] print:space-y-2">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs uppercase tracking-wide text-warning border border-warning/30 rounded px-1.5 py-0.5 align-middle">
      {children}
    </span>
  );
}

export default function DistrictPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <MarketingHeader active="district" />

      <main className="max-w-[760px] mx-auto px-6 pt-16 pb-8 print:pt-4">
        {/* Masthead */}
        <div className="mb-12 print:mb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-stone mb-4">
            For district &amp; school leaders
          </p>
          <div className="flex items-start justify-between gap-6">
            <h1 className="font-serif text-4xl font-semibold text-ink leading-tight print:text-2xl">
              A secondary screener for oral reading fluency.
            </h1>
            <PrintButton />
          </div>
          <p className="text-stone leading-relaxed mt-6 max-w-[60ch] print:mt-3">
            This page is FluencyScope&rsquo;s working disclosure for school and
            district review: what the instrument measures, how, what it
            deliberately is not, and where it stands against the NYC DOE&rsquo;s
            AI guidance. It is kept current as the product evolves; the printed
            version serves as a vendor disclosure summary.
          </p>
        </div>

        <Section n="01" title="What it measures — and what it is not">
          <p>
            FluencyScope measures <strong>oral reading fluency</strong>: a
            student reads a leveled passage aloud for sixty seconds in the
            browser, and the reading is scored for words correct per minute
            (WCPM), accuracy, and prosody, with a short comprehension check
            that qualifies the fluency score. It is a{" "}
            <strong>secondary screener</strong>, designed to complement
            district-mandated instruments such as Acadience &mdash; never to
            replace them.
          </p>
          <p>
            It is deliberately not: tutoring or practice software, curriculum, a
            standalone comprehension assessment, a student-facing product with
            accounts or logins, or an analytics platform that groups or ranks
            students across classrooms. Results are advisory screening data for
            the teacher &mdash; not a diagnosis, a grade, or a placement
            decision.
          </p>
        </Section>

        <Section n="02" title="Measurement approach">
          <p>
            Word-level scoring is <strong>deterministic</strong>. Speech is
            transcribed by an automatic speech recognition engine, then aligned
            to the passage and classified (correct, substitution, omission,
            self-correction, mispronunciation) by transparent, rule-based
            algorithms. No language model judges whether a word was read
            correctly. Self-corrections count as correct, following
            Hasbrouck&ndash;Tindal convention.
          </p>
          <p>
            Scores are reported against the{" "}
            <strong>Hasbrouck&ndash;Tindal (2017) norms</strong>{" "}&mdash; public
            domain and widely recognized &mdash; as At / Below / Well Below
            Benchmark bands for beginning, middle, and end of year. Whole-class
            screening uses a <strong>median-of-three-passages</strong>{" "}protocol
            (Forms A/B/C per level), mirroring Acadience administration so bands
            are interpretable in district-familiar terms. Passages are leveled
            (Lexile 520&ndash;1185) with below-grade routing for students
            reading below grade level.
          </p>
          <p>
            AI is used only where judgment is explicitly advisory and labeled as
            such: a prosody rating on the familiar 1&ndash;4 scale, a short
            written observation for the teacher, and grading of open-response
            comprehension answers. The model receives structured data and text
            only &mdash; <strong>never raw student audio</strong>.
          </p>
        </Section>

        <Section n="03" title="Alignment with NYC DOE AI guidance">
          <p>
            FluencyScope is built against the Chancellor&rsquo;s AI guidance
            (March 2026) as a design constraint, not a compliance afterthought:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Advisory-only framing.</strong>{" "}Every AI-generated output
              carries a visible advisory disclaimer; no output is framed as a
              determination about a student.
            </li>
            <li>
              <strong>Prominent teacher override.</strong>{" "}Teachers can approve,
              reject, or reclassify any flagged word, adjust prosody, and edit
              summaries; metrics recompute from teacher corrections, and the
              override is the record.
            </li>
            <li>
              <strong>Public explainability.</strong>{" "}A plain-language page
              describing exactly where deterministic rules end and AI begins is
              public at{" "}
              <Link
                href="/explainability"
                className="text-ink underline underline-offset-4 decoration-mist"
              >
                /explainability
              </Link>
              , linked from every report.
            </li>
            <li>
              <strong>Voice treated as potentially biometric.</strong>{" "}Student
              audio is accessible only to authenticated teachers of the
              student&rsquo;s school; students never need accounts, and the
              student flow collects a first name and initial only as entered by
              the student.
            </li>
            <li>
              <strong>No model training on student data.</strong>{" "}No student
              audio, transcript, or result trains any model &mdash; ours or a
              vendor&rsquo;s. Teacher corrections are used only as categories to
              refine rules and prompts, never as training data.
            </li>
            <li>
              <strong>Data retention policy</strong>{" "}with automatic audio
              deletion: <Status>in development</Status> &mdash; reports are
              already designed to remain fully usable after audio removal.
            </li>
          </ul>
        </Section>

        <Section n="04" title="Data practices">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Multi-tenant isolation is enforced in the database itself
              (Postgres row-level security keyed to each school) &mdash; a
              school&rsquo;s data is invisible to every other school by
              construction, not by application logic.
            </li>
            <li>
              Students access assessments through an expiring shared link; no
              student accounts, emails, or passwords exist in the system.
            </li>
            <li>
              Reports are teacher-only: anonymous access to session results is
              disabled at the database-policy level.
            </li>
            <li>
              Processing runs on Vercel and Supabase infrastructure with
              transcription by Deepgram and advisory text by Anthropic; all
              vendor processing is inference-only, with no training on student
              data.
            </li>
          </ul>
        </Section>

        <Section n="05" title="Validation status">
          <p>
            We hold the position that a fluency screener&rsquo;s largest risk is
            silent: ASR errors masquerading as student reading errors,
            disproportionately for students whose speech differs from the
            engine&rsquo;s training distribution. Our stance is to validate
            before wider deployment and to publish the method:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Transcription accuracy (WER) validation</strong>{" "}against
              hand transcriptions, with explicit coverage of AAVE,
              Spanish-influenced English, and newcomer accents &mdash; the
              acceptance test is that dialect and accent do not score as
              reading errors. <Status>in progress</Status>
            </li>
            <li>
              <strong>Matched-student comparison</strong>{" "}&mdash; the same
              students assessed manually and via FluencyScope, coordinated
              through the piloting school as data custodian.{" "}
              <Status>planned</Status>
            </li>
            <li>
              <strong>ERMA review</strong>{" "}(NYC DOE research and data-privacy
              approval) as the deployment gate for wider use.{" "}
              <Status>in preparation</Status>
            </li>
          </ul>
        </Section>

        <Section n="06" title="Deployment & commercial model">
          <p>
            Licensed per school, per year &mdash; a school-level decision rather
            than a district procurement. The student flow is built for
            real-classroom constraints: standard NYC-spec Chromebooks, flaky
            WiFi (recordings are kept and retried until upload succeeds &mdash;
            a student never re-reads because of a network failure), and no
            installation beyond a browser.
          </p>
          <p className="text-stone">
            Piloting now with NYC middle schools. For a demonstration with your
            school&rsquo;s own passages and benchmarks, contact us through your
            school&rsquo;s pilot lead, or start with the product overview on the{" "}
            <Link
              href="/"
              className="text-ink underline underline-offset-4 decoration-mist"
            >
              main page
            </Link>
            .
          </p>
        </Section>

        {/* Print-only footer line */}
        <p className="hidden print:block text-[10px] text-stone mt-6 pt-3 border-t border-mist">
          FluencyScope — vendor disclosure summary. Advisory screening data
          only; not a diagnosis, grade, or placement decision. Public
          methodology: fluencyscope /explainability.
        </p>
      </main>

      <MarketingFooter />
    </div>
  );
}
