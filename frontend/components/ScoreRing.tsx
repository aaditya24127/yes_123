'use client';
import { motion } from 'framer-motion';

export default function ScoreRing({ value, color, size = 64, stroke = 7, label }: { value: number | null; color: string; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--b100))" strokeWidth={stroke} />
        {value != null && (
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
            initial={false} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-semibold text-ink-900" style={{ fontSize: size * 0.3 }}>{value == null ? '–' : Math.round(value)}</span>
        {label && <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">{label}</span>}
      </div>
    </div>
  );
}
