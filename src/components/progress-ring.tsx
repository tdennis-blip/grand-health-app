// Reusable SVG progress ring. Renders a circle outlined to `value`/100.
//
// Usage:
//   <ProgressRing value={72} size={120} stroke={10}>
//     <span className="text-3xl font-semibold">72</span>
//   </ProgressRing>
//
// Pure SVG — no client-side JS — so it's safe inside server components.
import * as React from "react";

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color = "#0d9488",
  trackColor = "#f1f5f9",
  children,
  ariaLabel,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}) {
  const safe = value == null || !Number.isFinite(value) ? 0 : Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${safe} of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          {children}
        </div>
      )}
    </div>
  );
}
