"use client";

import { Skeleton } from "./Skeleton";

/**
 * Dashboard loading skeleton - 6 rows matching session list layout.
 * Per row: name (18px×140px), waveform (24px×80px), time (14px×64px)
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-0">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-4 py-5">
          <div className="grid grid-cols-[1fr_80px_auto] gap-4 items-center">
            {/* Left: name + meta */}
            <div className="min-w-0 space-y-2">
              <Skeleton width={140} height={18} />
              <Skeleton width={220} height={14} />
            </div>

            {/* Middle: waveform placeholder */}
            <div className="flex justify-center">
              <Skeleton width={80} height={24} className="rounded-sm" />
            </div>

            {/* Right: time */}
            <div className="flex justify-end">
              <Skeleton width={64} height={14} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
