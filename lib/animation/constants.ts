/**
 * Animation timing constants for consistent animation across the app.
 * All values in seconds unless noted.
 */

// Page and hover transitions
export const TRANSITION = {
  page: 0.24, // 240ms for page transitions
  hover: 0.12, // 120ms for hover states
} as const;

// Score reveal sequence timings
export const SCORE_REVEAL = {
  wcpm: 0.8, // WCPM count-up duration
  percentileDelay: 0.2, // Delay before percentile starts (after WCPM ends)
  percentile: 0.6, // Percentile bar animation duration
  dotStagger: 0.05, // 50ms stagger between prosody dots
  waveformFade: 0.4, // Waveform fade-in duration
  errorDotDelay: 0.2, // Delay before error dots appear (after waveform)
  errorDotStagger: 0.03, // 30ms stagger between error dots
} as const;

// Total sequence duration check (should be under 1.6s)
// WCPM: 0.8s + delay: 0.2s + percentile: 0.6s = 1.6s
// Waveform/summary fade happens in parallel with prosody dots

// Ease curves
export const EASING = {
  easeOut: "easeOut",
  easeInOut: "easeInOut",
} as const;
