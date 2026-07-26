"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden text-sm text-stone border border-ink/15 rounded-lg px-3 py-1.5 hover:text-ink hover:border-ink/30 transition-colors duration-[120ms]"
    >
      Print this page
    </button>
  );
}
