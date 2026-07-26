import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { TimedReadVignette, BenchmarkSpecimen } from "@/components/marketing/Vignettes";

export const metadata: Metadata = {
  title: "FluencyScope — Hear every student read",
  description:
    "Oral reading fluency screening for middle school. One shared link screens a whole class; teachers get trustworthy, overridable WCPM reports in district-recognized terms.",
};

const SECTION = "max-w-[680px] mx-auto px-6";
const WIDE = "max-w-[1020px] mx-auto px-6";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.18em] text-stone mb-4">
      {children}
    </p>
  );
}

function Figure({
  src,
  alt,
  caption,
  priority,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
}) {
  return (
    <figure className={WIDE}>
      <div className="rounded-xl border border-ink/10 shadow-[0_2px_24px_rgba(10,10,10,0.06)] overflow-hidden bg-paper">
        <Image
          src={src}
          alt={alt}
          width={1440}
          height={900}
          priority={priority}
          className="w-full h-auto"
        />
      </div>
      <figcaption className="text-xs text-stone mt-3 text-center">
        {caption}
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <MarketingHeader active="home" />

      {/* ===== Hero ===== */}
      <section className={`${SECTION} pt-20 sm:pt-28 pb-16`}>
        <p className="rise-in text-xs uppercase tracking-[0.18em] text-stone mb-6">
          Oral reading fluency &middot; Grades 6&ndash;8
        </p>
        <h1
          className="rise-in font-serif font-semibold text-ink leading-[1.08] mb-8"
          style={{ fontSize: "clamp(40px, 7vw, 64px)", animationDelay: "80ms" }}
        >
          Hear every student read.
        </h1>
        <p
          className="rise-in text-lg text-ink/85 leading-relaxed max-w-[54ch] mb-4"
          style={{ animationDelay: "160ms" }}
        >
          Mandated literacy screeners are silent &mdash; they can tell you a
          student struggles, but not what happens when that student reads aloud.
          The only alternative has been a teacher, a stopwatch, and one student
          at a time.
        </p>
        <p
          className="rise-in text-lg text-ink/85 leading-relaxed max-w-[54ch] mb-10"
          style={{ animationDelay: "240ms" }}
        >
          FluencyScope screens a whole class through one shared link: each
          student reads aloud for sixty seconds on a Chromebook, and the teacher
          gets a fluency report they can trust &mdash; and correct.
        </p>
        <div
          className="rise-in flex items-center gap-6"
          style={{ animationDelay: "320ms" }}
        >
          <a
            href="#teacher-report"
            className="bg-accent-blue text-paper text-base rounded-lg px-5 py-3 hover:bg-accent-blue/90 transition-colors duration-[120ms]"
          >
            See what teachers get
          </a>
          <Link
            href="/explainability"
            className="text-stone hover:text-ink transition-colors duration-[120ms]"
          >
            How scoring works &rarr;
          </Link>
        </div>
      </section>

      {/* ===== The gap ===== */}
      <section className={`${WIDE} py-16 border-t border-mist/60`}>
        <div className="grid sm:grid-cols-3 gap-10">
          <div>
            <h2 className="font-serif text-xl text-ink mb-3">
              Screeners are silent
            </h2>
            <p className="text-sm text-stone leading-relaxed">
              Universal screeners are multiple-choice and read-to-self. Oral
              reading fluency &mdash; the strongest single signal of reading
              trouble in the middle grades &mdash; never gets measured.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-xl text-ink mb-3">
              1:1 doesn&rsquo;t scale
            </h2>
            <p className="text-sm text-stone leading-relaxed">
              A hand-timed running record costs a class period per handful of
              students. In most middle schools it simply doesn&rsquo;t happen
              &mdash; so the data doesn&rsquo;t exist.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-xl text-ink mb-3">
              The missing middle
            </h2>
            <p className="text-sm text-stone leading-relaxed">
              Between the mandated screener and classroom intervention sits a
              diagnostic gap. FluencyScope fills exactly that gap &mdash; as a
              secondary screener that complements the instruments your district
              already uses.
            </p>
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section className="border-t border-mist/60 py-20">
        <div className={SECTION}>
          <SectionLabel>How it works</SectionLabel>
          <h2 className="font-serif text-3xl text-ink mb-12">
            A class period, not a marking period.
          </h2>

          <ol className="space-y-12">
            <li className="grid grid-cols-[3rem_1fr] gap-4">
              <span className="font-serif text-3xl text-stone/50">1</span>
              <div>
                <h3 className="text-ink font-medium mb-2">Share one link</h3>
                <p className="text-stone leading-relaxed">
                  Pick a passage level and share the link with your class. No
                  student accounts, no installs &mdash; it runs in the browser
                  on the Chromebooks students already have.
                </p>
              </div>
            </li>
            <li className="grid grid-cols-[3rem_1fr] gap-4">
              <span className="font-serif text-3xl text-stone/50">2</span>
              <div>
                <h3 className="text-ink font-medium mb-2">
                  Students read for sixty seconds
                </h3>
                <p className="text-stone leading-relaxed mb-6">
                  Each student reads a leveled passage aloud while the browser
                  records. The read is a calm, fixed 60-second sample &mdash; no
                  ticking clock, no way to get it wrong. A short comprehension
                  check follows.
                </p>
                <TimedReadVignette />
              </div>
            </li>
            <li className="grid grid-cols-[3rem_1fr] gap-4">
              <span className="font-serif text-3xl text-stone/50">3</span>
              <div>
                <h3 className="text-ink font-medium mb-2">
                  Reports arrive as students finish
                </h3>
                <p className="text-stone leading-relaxed">
                  Each reading is transcribed and scored deterministically
                  &mdash; words correct per minute, accuracy, benchmark band
                  &mdash; in about thirty seconds per student.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* ===== Dashboard ===== */}
      <section className="border-t border-mist/60 py-20">
        <div className={`${SECTION} mb-10`}>
          <SectionLabel>The dashboard</SectionLabel>
          <h2 className="font-serif text-3xl text-ink mb-4">
            A whole class, one screen.
          </h2>
          <p className="text-stone leading-relaxed">
            Readings arrive grouped by student. A median-of-three assessment
            &mdash; the same protocol Acadience uses &mdash; shows as a single
            row with its median score and benchmark band, expandable down to
            every word of every read.
          </p>
        </div>
        <Figure
          src="/marketing/dashboard.png"
          alt="FluencyScope teacher dashboard showing a class of readings grouped by student, with median WCPM and benchmark bands"
          caption="The demo classroom shown here is seeded data — every number was produced by the real scoring engine."
        />
      </section>

      {/* ===== The report ===== */}
      <section id="teacher-report" className="border-t border-mist/60 py-20">
        <div className={`${SECTION} mb-10`}>
          <SectionLabel>The report</SectionLabel>
          <h2 className="font-serif text-3xl text-ink mb-4">
            Scores in the language your district already speaks.
          </h2>
          <p className="text-stone leading-relaxed mb-8">
            Words correct per minute against Hasbrouck&ndash;Tindal norms,
            banded At / Below / Well Below Benchmark for the beginning, middle,
            and end of year. No invented metrics.
          </p>
          <BenchmarkSpecimen />
        </div>
        <Figure
          src="/marketing/report.png"
          alt="A FluencyScope student report: WCPM with benchmark band, accuracy, prosody, comprehension, and an advisory AI observation"
          caption="Every report: WCPM, accuracy, prosody, a comprehension check, error patterns, and a synced word-level transcript."
        />
        <div className={`${SECTION} mt-10`}>
          <ul className="grid sm:grid-cols-2 gap-x-10 gap-y-4 text-sm text-stone leading-relaxed">
            <li>
              <span className="text-ink font-medium">Deterministic scoring.</span>{" "}
              Word-level errors are classified by transparent rules, not by a
              language model&rsquo;s judgment.
            </li>
            <li>
              <span className="text-ink font-medium">
                Teacher-overridable, word by word.
              </span>{" "}
              Approve, reject, or reclassify any flagged word; metrics recompute
              instantly from your corrections.
            </li>
            <li>
              <span className="text-ink font-medium">
                Prosody on the familiar 1&ndash;4 scale.
              </span>{" "}
              Expression, phrasing, smoothness, and pace &mdash; labeled as
              advisory, never averaged into the score.
            </li>
            <li>
              <span className="text-ink font-medium">
                A comprehension check, not a comprehension score.
              </span>{" "}
              Three short questions qualify the fluency number &mdash; fast
              reading without understanding gets flagged, not celebrated.
            </li>
          </ul>
        </div>
      </section>

      {/* ===== Trust ===== */}
      <section className="border-t border-mist/60 py-20">
        <div className={SECTION}>
          <SectionLabel>Built to be doubted</SectionLabel>
          <h2 className="font-serif text-3xl text-ink mb-4">
            Trust is the product.
          </h2>
          <p className="text-stone leading-relaxed mb-10 max-w-[56ch]">
            An assessment a teacher can&rsquo;t interrogate is an assessment a
            teacher shouldn&rsquo;t use. FluencyScope is built on the assumption
            that you will &mdash; and should &mdash; question it.
          </p>
          <dl>
            <div className="grid sm:grid-cols-[220px_1fr] gap-1 sm:gap-6 py-5 border-t border-mist/60">
              <dt className="text-ink font-medium">Advisory only</dt>
              <dd className="text-sm text-stone leading-relaxed">
                Results are screening data to inform instruction &mdash; never a
                diagnosis, a grade, or a placement decision. That framing is on
                every report, not in the fine print.
              </dd>
            </div>
            <div className="grid sm:grid-cols-[220px_1fr] gap-1 sm:gap-6 py-5 border-t border-mist/60">
              <dt className="text-ink font-medium">
                The teacher outranks the AI
              </dt>
              <dd className="text-sm text-stone leading-relaxed">
                Every AI-touched output &mdash; summaries, prosody, flagged
                words &mdash; carries a visible override. Your correction is the
                record.
              </dd>
            </div>
            <div className="grid sm:grid-cols-[220px_1fr] gap-1 sm:gap-6 py-5 border-t border-mist/60">
              <dt className="text-ink font-medium">
                Student data trains nothing
              </dt>
              <dd className="text-sm text-stone leading-relaxed">
                No student audio, transcript, or result is used to train any
                model. Audio is treated as potentially biometric: it stays
                behind teacher authentication, always.
              </dd>
            </div>
            <div className="grid sm:grid-cols-[220px_1fr] gap-1 sm:gap-6 py-5 border-t border-b border-mist/60">
              <dt className="text-ink font-medium">
                Fairness is a gate, not a feature
              </dt>
              <dd className="text-sm text-stone leading-relaxed">
                Speech recognition can mistake dialect and accent for reading
                error. Our pre-pilot validation protocol checks that AAVE,
                Spanish-influenced, and newcomer accents do not score as errors
                &mdash; that work happens before wider deployment, not after.
              </dd>
            </div>
          </dl>
          <p className="text-sm text-stone mt-8">
            The full methodology is public:{" "}
            <Link
              href="/explainability"
              className="text-ink underline underline-offset-4 decoration-mist hover:decoration-ink transition-colors duration-[120ms]"
            >
              how FluencyScope works
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ===== Median protocol ===== */}
      <section className="border-t border-mist/60 py-20">
        <div className={`${SECTION} mb-10`}>
          <SectionLabel>Comparability</SectionLabel>
          <h2 className="font-serif text-3xl text-ink mb-4">
            Median of three, like the instruments you know.
          </h2>
          <p className="text-stone leading-relaxed">
            One passage is a sample; three are a screen. FluencyScope&rsquo;s
            median-of-three protocol mirrors Acadience, so a FluencyScope band
            and a district benchmark band mean the same kind of thing.
          </p>
        </div>
        <Figure
          src="/marketing/median-report.png"
          alt="An expanded dashboard group showing the overall median-of-three report with benchmark band, accuracy, prosody, and comprehension"
          caption="The overall median report: three passages, one honest number, with partial reads flagged rather than hidden."
        />
      </section>

      {/* ===== Closing ===== */}
      <section className="border-t border-mist/60 py-24">
        <div className={`${SECTION} text-center`}>
          <h2 className="font-serif text-3xl text-ink mb-4">
            Piloting now with NYC middle schools.
          </h2>
          <p className="text-stone leading-relaxed max-w-[46ch] mx-auto mb-8">
            FluencyScope is licensed per school and deployed alongside your
            existing screeners. District and school leaders can start with the
            measurement and compliance details.
          </p>
          <Link
            href="/district"
            className="inline-block bg-accent-blue text-paper text-base rounded-lg px-5 py-3 hover:bg-accent-blue/90 transition-colors duration-[120ms]"
          >
            For district &amp; school leaders
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
