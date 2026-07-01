'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Player, PotAward } from '@/lib/poker';

interface WinnerModalProps {
  visible: boolean;
  awards: readonly PotAward[];
  players: readonly Player[];
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

/** Showdown overlay announcing winners, hands and pot shares. Auto-dismisses
 *  when the next hand is dealt — there is no manual "deal" button. */
export function WinnerModal({ visible, awards, players }: WinnerModalProps) {
  const summaries = summarise(awards, players);

  return (
    <AnimatePresence>
      {visible && summaries.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-center shadow-2xl ring-1 ring-amber-300/30"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, -8, 8, 0] }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="mx-auto mb-2 text-4xl"
            >
              🏆
            </motion.div>
            <h2 className="mb-4 text-lg font-bold text-amber-300">Hand Complete</h2>

            <ul className="mb-4 space-y-2 text-left">
              {summaries.map((s) => (
                <li
                  key={s.name}
                  className="flex flex-col rounded-lg bg-slate-950/50 px-3 py-2 ring-1 ring-white/5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{s.name}</span>
                    <span className="font-mono text-amber-300">+{s.total.toLocaleString()}</span>
                  </div>
                  {s.handDescription && (
                    <span className="text-xs text-slate-400">{s.handDescription}</span>
                  )}
                </li>
              ))}
            </ul>

            <p className="text-xs text-slate-400">Next hand dealing…</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
