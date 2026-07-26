import Link from "next/link";

export function MarketingHeader({ active }: { active?: "home" | "district" }) {
  return (
    <header className="print:hidden border-b border-mist/60">
      <div className="max-w-[1020px] mx-auto px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.22em] font-medium text-ink"
        >
          FluencyScope
        </Link>
        <nav className="flex items-center gap-3 sm:gap-6 text-sm">
          <Link
            href="/explainability"
            className="hidden sm:inline text-stone hover:text-ink transition-colors duration-[120ms]"
          >
            How scoring works
          </Link>
          <Link
            href="/district"
            className={
              active === "district"
                ? "text-ink underline underline-offset-4 decoration-mist"
                : "text-stone hover:text-ink transition-colors duration-[120ms]"
            }
          >
            For districts
          </Link>
          <Link
            href="/auth/login"
            className="text-ink border border-ink/20 rounded-lg px-3 py-1.5 hover:bg-ink hover:text-paper transition-colors duration-[120ms]"
          >
            Teacher sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
