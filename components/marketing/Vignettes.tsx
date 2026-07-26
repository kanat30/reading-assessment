/**
 * Small typographic recreations of product moments, rendered in real UI idiom
 * rather than screenshots — crisp on any display and honest about what they are.
 */

/** The student's calm 60-second read: a depleting bar, no ticking numbers. */
export function TimedReadVignette() {
  return (
    <div className="rounded-xl border border-mist bg-paper px-6 py-8 sm:px-10">
      <p className="font-serif text-lg text-ink/90 leading-relaxed mb-8 max-w-[46ch]">
        For nearly seventy years, no wolves lived in Yellowstone National Park.
        Hunters and ranchers had eliminated them by 1926&hellip;
      </p>
      <div className="h-1 rounded-full bg-mist overflow-hidden">
        <div className="h-full bg-ink/70 rounded-full timer-deplete" />
      </div>
      <div className="flex items-baseline justify-between mt-3">
        <p className="text-xs text-stone">
          A fixed 60-second sample &mdash; the app stops and advances on its own
        </p>
        <p className="text-xs text-stone timer-cue">Almost done</p>
      </div>
    </div>
  );
}

/** WCPM against Hasbrouck–Tindal norms, in the report's own visual language. */
export function BenchmarkSpecimen() {
  return (
    <div className="rounded-xl border border-mist bg-paper px-6 py-8 sm:px-10">
      <div className="flex items-baseline gap-3 mb-6">
        <span className="font-serif text-5xl font-semibold text-ink">147</span>
        <span className="text-sm uppercase tracking-wide text-stone">wcpm</span>
        <span className="ml-auto text-sm text-success font-medium">
          At Benchmark
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden flex">
        <div className="h-full bg-alert/15" style={{ width: "54.5%" }} />
        <div className="h-full bg-warning/20" style={{ width: "12%" }} />
        <div className="h-full bg-success/20 flex-1" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-1.5 rounded-full bg-ink"
          style={{ left: "73.5%" }}
        />
      </div>
      <div className="relative mt-2 h-4 text-[11px] text-stone">
        <span className="absolute" style={{ left: "54.5%", transform: "translateX(-50%)" }}>
          25th: 109
        </span>
        <span className="absolute" style={{ left: "66.5%", transform: "translateX(-50%)" }}>
          50th: 133
        </span>
      </div>
      <p className="text-xs text-stone mt-4">
        Grade 5 norms, middle of year &mdash; Hasbrouck&ndash;Tindal (2017),
        the same public-domain norms districts already recognize
      </p>
    </div>
  );
}
