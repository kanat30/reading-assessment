"use client";

interface MiniWaveformProps {
  peaks: number[] | null | undefined;
  className?: string;
  isHovered?: boolean;
}

/**
 * A tiny inline waveform visualization for the dashboard.
 * Renders 80px wide x 24px tall SVG with vertical bars.
 *
 * If peaks data is unavailable, renders a row of low-contrast dashes.
 */
export function MiniWaveform({ peaks, className = "", isHovered = false }: MiniWaveformProps) {
  const width = 80;
  const height = 24;
  const barWidth = 1;
  const gap = 1;
  const totalBarSpace = barWidth + gap;

  // Calculate how many bars we can fit
  const maxBars = Math.floor(width / totalBarSpace);

  // If no peaks, render placeholder dashes
  if (!peaks || peaks.length === 0 || peaks.every((p) => p === 0)) {
    const dashCount = 20;
    const dashWidth = 2;
    const dashGap = (width - dashCount * dashWidth) / (dashCount - 1);

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-label="No waveform data"
      >
        {Array.from({ length: dashCount }).map((_, i) => (
          <rect
            key={i}
            x={i * (dashWidth + dashGap)}
            y={height / 2 - 0.5}
            width={dashWidth}
            height={1}
            fill="currentColor"
            className="text-stone/30"
          />
        ))}
      </svg>
    );
  }

  // Sub-sample peaks to fit the available bars
  const step = Math.max(1, Math.floor(peaks.length / maxBars));
  const sampledPeaks: number[] = [];

  for (let i = 0; i < maxBars && i * step < peaks.length; i++) {
    // Take the max of the range we're sampling
    let max = 0;
    for (let j = i * step; j < Math.min((i + 1) * step, peaks.length); j++) {
      if (peaks[j] > max) {
        max = peaks[j];
      }
    }
    sampledPeaks.push(max);
  }

  const midY = height / 2;
  const maxBarHeight = height - 4; // Leave some padding

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`transition-opacity duration-120 ${className}`}
      style={{ opacity: isHovered ? 1 : 0.5 }}
      aria-label="Audio waveform"
    >
      {sampledPeaks.map((peak, i) => {
        const barHeight = Math.max(2, peak * maxBarHeight);
        const x = i * totalBarSpace;
        const y = midY - barHeight / 2;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill="currentColor"
            className="text-stone"
          />
        );
      })}
    </svg>
  );
}
