import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="print:hidden border-t border-mist/60 mt-24">
      <div className="max-w-[1020px] mx-auto px-6 py-10 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] font-medium text-ink mb-2">
            FluencyScope
          </p>
          <p className="text-sm text-stone max-w-[38ch]">
            Advisory screening data for teachers — never a diagnosis, a grade,
            or a placement decision.
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/explainability" className="text-stone hover:text-ink transition-colors duration-[120ms]">
            How scoring works
          </Link>
          <Link href="/district" className="text-stone hover:text-ink transition-colors duration-[120ms]">
            For district &amp; school leaders
          </Link>
          <Link href="/auth/login" className="text-stone hover:text-ink transition-colors duration-[120ms]">
            Teacher sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
