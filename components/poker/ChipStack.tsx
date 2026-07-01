'use client';

import { motion } from 'framer-motion';

interface ChipStackProps {
  amount: number;
  /** Optional caption (e.g. "Pot"). */
  label?: string;
  compact?: boolean;
}

interface Denomination {
  value: number;
  /** Tailwind classes for the chip face + edge. */
  face: string;
  ring: string;
}

/** The house coins: 100 green, 500 blue, 1000 red. */
export const COINS: readonly Denomination[] = [
  { value: 1000, face: 'bg-red-500', ring: 'border-red-200' },
  { value: 500, face: 'bg-blue-500', ring: 'border-blue-200' },
  { value: 100, face: 'bg-green-500', ring: 'border-green-200' },
];

interface CoinPile {
  denom: Denomination;
  count: number;
}

/** Greedy breakdown of a chip amount into 1000/500/100 coins (+ remainder). */
export function coinBreakdown(amount: number): { piles: CoinPile[]; remainder: number } {
  let remaining = Math.max(0, Math.floor(amount));
  const piles: CoinPile[] = [];
  for (const denom of COINS) {
    const count = Math.floor(remaining / denom.value);
    if (count > 0) {
      piles.push({ denom, count });
      remaining -= count * denom.value;
    }
  }
  return { piles, remainder: remaining };
}

/** A coin readout: stacked colored chips per denomination with counts + total. */
export function ChipStack({ amount, label, compact = false }: ChipStackProps) {
  if (amount <= 0) return null;
  const { piles } = coinBreakdown(amount);
  const size = compact ? 12 : 16;

  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      className="flex items-center gap-2"
    >
      <div className="flex items-end gap-1.5">
        {piles.map(({ denom, count }) => (
          <div key={denom.value} className="relative flex flex-col items-center">
            <div className="relative" style={{ width: size, height: size + Math.min(count - 1, 5) * 3 }}>
              {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
                <div
                  key={i}
                  className={`absolute rounded-full border-2 shadow ${denom.face} ${denom.ring}`}
                  style={{ width: size, height: size, bottom: i * 3 }}
                />
              ))}
            </div>
            {count > 1 && (
              <span className="mt-0.5 font-mono text-[0.55rem] leading-none text-slate-200">
                ×{count}
              </span>
            )}
          </div>
        ))}
      </div>
      <span
        className={`font-mono font-semibold tabular-nums text-amber-100 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        {amount.toLocaleString()}
      </span>
      {label && <span className="text-xs text-amber-200/70">{label}</span>}
    </motion.div>
  );
}
