"use client";

import { useId, type CSSProperties } from "react";

type TimerStatus = "idle" | "running" | "paused" | "completed";

type TimerHourglassProps = {
  progress: number;
  status: TimerStatus;
};

const grainPositions = [77.6, 78.4, 79.2, 80, 80.8, 81.6, 82.4];

export function TimerHourglass({ progress, status }: TimerHourglassProps) {
  const id = useId().replace(/:/g, "");
  const percentage = Math.min(100, Math.max(0, progress));
  const top = 28 + 66 * (1 - Math.cbrt(1 - percentage / 100));
  const peak = 170 - percentage * 0.66;
  const fallDistance = Math.max(8, peak - 95);
  const style = { "--sand-fall": `${fallDistance}px` } as CSSProperties;
  const topSandPath = `M20 ${top} Q80 ${top + 4} 140 ${top} V96 H20 Z`;
  const bottomSandPath = `M20 171 H140 V${peak + 14} Q113 ${peak + 15} 80 ${peak} Q47 ${peak + 15} 20 ${peak + 14} Z`;
  const showStream = (status === "running" || status === "paused") && percentage < 100;

  return (
    <svg
      viewBox="0 0 160 190"
      className="sp-timer-hourglass"
      data-state={status}
      aria-hidden="true"
      style={style}
    >
      <defs>
        <clipPath id={`${id}-top`}>
          <path d="M24 20 H136 Q130 63 85 94 H75 Q30 63 24 20 Z" />
        </clipPath>
        <clipPath id={`${id}-bottom`}>
          <path d="M75 96 H85 Q130 127 136 170 H24 Q30 127 75 96 Z" />
        </clipPath>
        <linearGradient id={`${id}-sand`} x1="0" y1="0" x2="0.7" y2="1">
          <stop stopColor="var(--sand-light)" />
          <stop offset="0.55" stopColor="var(--sand-body)" />
          <stop offset="1" stopColor="var(--sand-shadow)" />
        </linearGradient>
        <linearGradient id={`${id}-glass`}>
          <stop stopColor="var(--glass-fill)" stopOpacity="0.7" />
          <stop offset="0.45" stopColor="var(--glass-fill)" stopOpacity="0.15" />
          <stop offset="1" stopColor="var(--glass-fill)" stopOpacity="0.55" />
        </linearGradient>
        <pattern id={`${id}-texture`} width="9" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.65" fill="var(--sand-shadow)" opacity="0.32" />
          <circle cx="6" cy="5" r="0.6" fill="var(--sand-light)" opacity="0.7" />
        </pattern>
      </defs>

      <path
        d="M24 20 H136 Q130 63 85 94 H75 Q30 63 24 20 Z M75 96 H85 Q130 127 136 170 H24 Q30 127 75 96 Z"
        fill={`url(#${id}-glass)`}
        stroke="var(--glass-edge)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {percentage < 100 ? (
        <g clipPath={`url(#${id}-top)`}>
          <path d={topSandPath} fill={`url(#${id}-sand)`} />
          <path d={topSandPath} fill={`url(#${id}-texture)`} />
          <path d={`M20 ${top} Q80 ${top + 4} 140 ${top}`} fill="none" stroke="var(--sand-light)" strokeWidth="2" />
        </g>
      ) : null}

      {percentage > 0 ? (
        <g clipPath={`url(#${id}-bottom)`}>
          <path d={bottomSandPath} fill={`url(#${id}-sand)`} />
          <path d={bottomSandPath} fill={`url(#${id}-texture)`} />
        </g>
      ) : null}

      {showStream ? (
        <g clipPath={`url(#${id}-bottom)`}>
          {grainPositions.map((x, index) => (
            <circle
              key={x}
              className="sp-timer-grain"
              cx={x}
              cy="95"
              r={index % 2 === 0 ? 1.2 : 1}
              fill={index % 2 === 0 ? "var(--sand-body)" : "var(--sand-light)"}
              style={{
                animationDelay: `${-0.17 * index}s`,
                animationDuration: `${0.7 + index * 0.05}s`,
              }}
            />
          ))}
        </g>
      ) : null}

      <path d="M34 29 Q40 57 65 76 M34 160 Q38 137 61 118" stroke="var(--glass-shine)" strokeWidth="3" strokeLinecap="round" opacity="0.75" fill="none" />
      <path d="M16 18 H144 M16 173 H144" stroke="var(--frame)" strokeWidth="10" strokeLinecap="round" />
      <path d="M21 15 H139 M21 170 H139" stroke="var(--frame-light)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
