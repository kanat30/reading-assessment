import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How FluencyScope Works — Explainability",
  description:
    "A plain-language explanation of how FluencyScope scores oral reading, where AI is and isn't used, and the controls teachers have over every result.",
};

/**
 * Public explainability page — required by the NYC DOE AI guidance
 * (advisory-only framing, transparency about AI use, teacher override).
 * No auth: this page must be readable by parents, teachers, and reviewers.
 */
export default function ExplainabilityPage() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <p className="text-xs text-stone uppercase tracking-wider mb-3">
          FluencyScope
        </p>
        <h1 className="font-serif text-3xl text-ink mb-2">
          How FluencyScope works
        </h1>
        <p className="text-stone text-sm mb-12">
          A plain-language explanation of how reading scores are produced,
          where AI is used (and where it is not), and the controls teachers
          have over every result.
        </p>

        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-3">
            What FluencyScope is
          </h2>
          <p className="text-ink/90 leading-relaxed mb-3">
            FluencyScope is a screening tool that helps teachers measure oral
            reading fluency. A student reads a short passage aloud on their
            device; the app records the reading, transcribes it, and reports
            words correct per minute (WCPM), accuracy, and related measures.
          </p>
          <p className="text-ink/90 leading-relaxed">
            Every result is <strong>advisory</strong>. FluencyScope does not
            diagnose reading disabilities, assign placements, or make
            decisions about students. It gives teachers information; teachers
            make the judgments.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-3">
            How the fluency score is computed — without AI judgment
          </h2>
          <p className="text-ink/90 leading-relaxed mb-3">
            The core score is <strong>deterministic</strong>: the same
            recording always produces the same result, computed by fixed
            rules, not by an AI model&apos;s opinion.
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-ink/90 leading-relaxed">
            <li>
              The recording is transcribed to text by a speech-recognition
              service (Deepgram).
            </li>
            <li>
              A rule-based algorithm aligns the transcript against the
              passage, word by word, and classifies each word as read
              correctly, substituted, omitted, self-corrected, or inserted.
              Self-corrections count as correct, following standard
              fluency-scoring practice.
            </li>
            <li>
              WCPM and accuracy are simple arithmetic over those word-level
              results, and are compared against published, public-domain
              national norms (Hasbrouck&ndash;Tindal) to show an At / Below /
              Well-Below Benchmark band.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-3">
            Where AI is used
          </h2>
          <p className="text-ink/90 leading-relaxed mb-3">
            A language model (Anthropic&apos;s Claude) is used for four
            clearly-marked, advisory features. It only ever receives
            structured numbers and text — <strong>never the student&apos;s
            audio</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink/90 leading-relaxed">
            <li>
              A 2&ndash;3 sentence written summary of the metrics for the
              teacher.
            </li>
            <li>
              An estimated 1&ndash;4 prosody rating (expression, phrasing,
              pace) based on timing patterns.
            </li>
            <li>Drafting comprehension questions for a passage.</li>
            <li>
              Suggesting a grade (correct / partial / incorrect) for a
              student&apos;s typed comprehension answers.
            </li>
          </ul>
          <p className="text-ink/90 leading-relaxed mt-3">
            Everything the AI produces is labeled with an &ldquo;AI&rdquo;
            badge in the report and can be edited or replaced by the teacher.
            If the AI is unavailable, the app falls back to simpler rule-based
            output — it never blocks a report.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-3">
            Teacher control
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink/90 leading-relaxed">
            <li>
              Teachers can correct any word-level result — approve or reject a
              flagged error, or flag a missed one. Scores recompute from the
              teacher&apos;s corrections.
            </li>
            <li>
              Teachers can rewrite the AI summary, adjust prosody ratings, and
              re-grade comprehension answers.
            </li>
            <li>
              Corrections are kept as an audit trail alongside the original
              automated result, so it is always clear what was machine-scored
              and what a teacher decided.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-3">
            Student data
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink/90 leading-relaxed">
            <li>
              Students do not create accounts or passwords; they open a link
              from their teacher and read.
            </li>
            <li>
              Voice recordings are treated as potentially biometric data:
              access requires an authenticated teacher of the student&apos;s
              own school, and each school&apos;s data is isolated from every
              other school&apos;s.
            </li>
            <li>
              <strong>No student data is used to train any AI model.</strong>
            </li>
            <li>
              Teachers can delete a student&apos;s session, which removes the
              recording and its results.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-3">
            Known limits
          </h2>
          <p className="text-ink/90 leading-relaxed">
            Speech recognition is imperfect. Background noise, quiet reading,
            and accent or dialect differences can cause transcription
            mistakes that surface as apparent reading errors. This is why
            every word-level result is reviewable and overridable by the
            teacher, why the report shows confidence information, and why
            FluencyScope should inform — never replace — a teacher&apos;s own
            listening and judgment.
          </p>
        </section>

        <footer className="pt-8 border-t border-mist/60">
          <p className="text-sm text-stone">
            Questions about this page or our data practices? Contact your
            school&apos;s FluencyScope administrator.
          </p>
        </footer>
      </div>
    </div>
  );
}
