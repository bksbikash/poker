'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Pot as PotType } from '@/lib/poker';
import { ChipStack } from './ChipStack';

interface PotProps {
  total: number;
  pots: readonly PotType[];
}

/** Central pot readout: the running total plus a breakdown of side pots. */
export function Pot({ total, pots }: PotProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <AnimatePresence mode="popLayout">
        {total > 0 ? (
          <motion.div
            key="pot"
            layout
            className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-1.5 backdrop-blur-sm ring-1 ring-amber-300/20"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">
              Pot
            </span>
            <ChipStack amount={total} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {pots.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1 text-[0.65rem] text-amber-100/80">
          {pots.map((pot, index) => (
            <span key={index} className="rounded bg-black/30 px-1.5 py-0.5">
              {pot.isMain ? 'Main' : `Side ${index}`}: {pot.amount.toLocaleString()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
