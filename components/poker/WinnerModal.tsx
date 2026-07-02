'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player, PotAward } from '@/lib/poker';

interface WinnerBannerProps {
  visible: boolean;
  awards: readonly PotAward[];
  players: readonly Player[];
  /** Epoch ms when the next hand deals — drives the countdown. */
  nextHandAt: number | null;
}

interface WinnerSummary {
  name: string;
  total: number;
  handDescription: string | null;
}

function summarise(awards: readonly PotAward[], players: readonly Player[]): WinnerSummary[] {
  const byPlayer = new Map<string, WinnerSummary>();
  for (const award of awards) {
    for (const winner of award.winners) {
      const player = players.find((p) => p.id === winner.playerId);
      if (!player) continue;
      const existing = byPlayer.get(winner.playerId);
      if (existing) {
        existing.total += winner.share;
        existing.handDescription = existing.handDescription ?? winner.hand?.description ?? null;
      } else {
        byPlayer.set(winner.playerId, {
          name: player.name,
          total: winner.share,
          handDescription: winner.hand?.description ?? null,
        });
      }
    }
  }
  return [...byPlayer.values()].sort((a, b) => b.total - a.total);
}

/**
 * A compact, non-blocking winner banner shown at the top of the table. It does
 * NOT cover the felt — the whole board and every revealed hand stays visible
 * for the full showdown window, with a countdown to the next deal.
 */
export function WinnerModal({ visible, awards, players, nextHandAt }: WinnerBannerProps) {
  const summaries = summarise(awards, players);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!visible || !nextHandAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [visible, nextHandAt]);

  const secondsLeft = nextHandAt ? Math.max(0, Math.ceil((nextHandAt - now) / 1000)) : null;

  return (
    <AnimatePresence>
      {visible && summaries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="pointer-events-none absolute left-1/2 top-2 z-30 flex w-[92%] max-w-md -translate-x-1/2 flex-col items-center gap-1 rounded-xl bg-slate-950/85 px-4 py-2 text-center shadow-2xl ring-1 ring-amber-300/40 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.6 }}
              className="text-xl"
            >
              🏆
            </motion.span>
            <span className="text-sm font-bold text-amber-300">
              {summaries.length === 1 ? 'Winner' : 'Winners'}
            </span>
            {secondsLeft !== null && (
              <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[0.65rem] text-slate-300">
                next deal in {secondsLeft}s
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-0.5">
            {summaries.map((s) => (
              <li key={s.name} className="text-xs text-slate-200">
                <span className="font-semibold">{s.name}</span>{' '}
                <span className="font-mono text-amber-300">+{s.total.toLocaleString()}</span>
                {s.handDescription && <span className="text-slate-400"> · {s.handDescription}</span>}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
