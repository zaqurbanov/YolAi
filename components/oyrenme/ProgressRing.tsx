'use client';

import { useEffect, useState } from 'react';

interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

// Small client island: the ONLY interactive/animated piece of the mobile
// course-detail hero. Mounts at dashoffset=circumference (empty ring) and
// transitions to the real percent on the next frame via a plain CSS
// transition — no vanilla DOM script, per the legaldrive-design skill's
// "what to drop" rule. Parent stays a server component.
export default function ProgressRing({ percent, size = 132, strokeWidth = 10 }: ProgressRingProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const targetOffset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 motion-reduce:[&_circle:last-child]:transition-none"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-surface-tertiary"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={mounted ? targetOffset : circumference}
        className="stroke-go-green transition-[stroke-dashoffset] duration-1000 ease-out"
      />
    </svg>
  );
}
