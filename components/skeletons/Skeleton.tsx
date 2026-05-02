"use client";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

/**
 * Base skeleton component with shimmer animation.
 * Uses mist→paper→mist gradient, 1.4s cycle, ease-in-out.
 */
export function Skeleton({ width, height, className = "" }: SkeletonProps) {
  const style: React.CSSProperties = {};

  if (width !== undefined) {
    style.width = typeof width === "number" ? `${width}px` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === "number" ? `${height}px` : height;
  }

  return (
    <div
      className={`skeleton-shimmer rounded bg-mist ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
