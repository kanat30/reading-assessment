"use client";

import { Skeleton } from "./Skeleton";

/**
 * Report loading skeleton matching the SessionReport layout.
 * - WCPM headline (96px×180px block)
 * - Percentile bar (6px full-width)
 * - 4 prosody rows (staggered blocks)
 * - 3 transcript lines
 * - Waveform area (80px tall stone block, no shimmer)
 */
export function ReportSkeleton() {
  return (
    <div className="space-y-8">
      {/* WCPM Headline */}
      <div className="text-center py-6">
        <div className="flex items-center justify-center gap-3">
          <Skeleton width={180} height={96} className="rounded-lg" />
        </div>
        {/* Percentile text */}
        <div className="flex justify-center mt-3">
          <Skeleton width={200} height={16} />
        </div>
      </div>

      {/* Percentile bar */}
      <div className="max-w-[600px] mx-auto">
        <Skeleton width="100%" height={6} className="rounded-full" />
      </div>

      {/* Metrics row */}
      <div className="rounded-xl border border-mist/60 overflow-hidden">
        <div className="p-6">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="text-center">
                <Skeleton width={48} height={36} className="mx-auto mb-2" />
                <Skeleton width={40} height={12} className="mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Summary block */}
      <div className="pl-6 border-l-2 border-mist">
        <Skeleton width={60} height={10} className="mb-2" />
        <div className="space-y-2">
          <Skeleton width="100%" height={18} />
          <Skeleton width="80%" height={18} />
        </div>
      </div>

      {/* Waveform area - static stone block, no shimmer */}
      <div className="rounded-xl border border-mist/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-mist/40 bg-mist/20">
          <Skeleton width={120} height={14} />
        </div>
        <div className="p-6">
          {/* Waveform placeholder - no shimmer */}
          <div className="h-[80px] bg-stone/10 rounded" />

          {/* Prosody gauges */}
          <div className="mt-8 space-y-4">
            {["Expression", "Phrasing", "Smoothness", "Pace"].map((label, i) => (
              <div key={label} className="flex items-center gap-4">
                <Skeleton width={180} height={14} />
                <div className="flex gap-1.5">
                  {[...Array(4)].map((_, j) => (
                    <Skeleton
                      key={j}
                      width={8}
                      height={8}
                      className="rounded-full"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Transcript skeleton - 3 lines */}
          <div className="mt-8 space-y-3">
            <Skeleton width="100%" height={16} />
            <Skeleton width="95%" height={16} />
            <Skeleton width="85%" height={16} />
          </div>
        </div>
      </div>
    </div>
  );
}
