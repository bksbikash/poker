'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Card, Player } from '@/lib/poker';
import { cardId } from '@/lib/poker';
import { PlayingCard } from './PlayingCard';
import { ChipStack } from './ChipStack';

interface PlayerSeatProps {
  player: Player;
  /** It is this player's turn to act. */
  isCurrent: boolean;
  /** This seat belongs to the local device (show cards larger, tag "You"). */
  isYou: boolean;
  isWinner: boolean;
  winningHandName?: string;
  highlightedIds?: ReadonlySet<string>;
  /** Standings leader — wears the king crown. */
  isLeader: boolean;
  /** Most in debt / lowest net worth — wears the loser badge. */
  isLoser: boolean;
}

/** A seated guest: crown/loser badge, stack, loan, hole cards and turn state. */
export function PlayerSeat({
  player,
  isCurrent,
  isYou,
  isWinner,
  winningHandName,
  highlightedIds,
  isLeader,
  isLoser,
}: PlayerSeatProps) {
  const cardSize = isYou ? 'lg' : 'sm';
  // Cards present in the payload are visible to this device; the remainder of
  // `holeCount` are the opponent's face-down cards.
  const visibleCards = player.holeCards;
  const totalCards = player.holeCount ?? player.holeCards.length;
  const hiddenCount = Math.max(0, totalCards - visibleCards.length);

  return (
    <motion.div layout className={`flex flex-col items-center gap-1 ${player.sittingOut ? 'opacity-45' : ''}`}>
      {/* Crown / loser indicator */}
      <div className="flex h-5 items-end">
        {isLeader && (
          <motion.span initial={{ scale: 0, y: 6 }} animate={{ scale: 1, y: 0 }} className="text-lg drop-shadow" title="Chip leader">
            👑
          </motion.span>
        )}
        {isLoser && !isLeader && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-lg opacity-80 drop-shadow"
            style={{ transform: 'rotate(180deg)', filter: 'grayscale(1) sepia(1) hue-rotate(-40deg)' }}
            title="Most in debt"
          >
            👑
          </motion.span>
        )}
      </div>

      {/* Hole cards */}
      <div className={`flex gap-1 ${player.folded ? 'opacity-50 grayscale' : ''}`}>
        {visibleCards.map((card: Card) => (
          <PlayingCard
            key={cardId(card)}
            card={card}
            size={cardSize}
            highlight={highlightedIds?.has(cardId(card))}
          />
        ))}
        {Array.from({ length: hiddenCount }).map((_, i) => (
          <PlayingCard key={`back-${i}`} faceDown size={cardSize} />
        ))}
        {totalCards === 0 && <div className="h-13 w-9" />}
      </div>

      {/* Info pill */}
      <motion.div
        animate={
          isCurrent
            ? {
                boxShadow: [
                  '0 0 0 0 rgba(251,191,36,0.0)',
                  '0 0 0 4px rgba(251,191,36,0.55)',
                  '0 0 0 0 rgba(251,191,36,0.0)',
                ],
              }
            : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
        }
        transition={isCurrent ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 }}
        className={`relative flex min-w-[5rem] flex-col items-center rounded-lg px-2 py-1.5 ring-1 sm:min-w-[6.5rem] sm:px-3 ${
          isWinner
            ? 'bg-amber-500/90 ring-amber-200'
            : isCurrent
              ? 'bg-slate-800 ring-amber-400/60'
              : 'bg-slate-900/85 ring-white/10'
        } ${isYou ? 'outline outline-2 outline-sky-400/70' : ''}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold ${
              isYou ? 'bg-sky-500 text-white' : 'bg-slate-600 text-slate-100'
            }`}
          >
            {player.name.charAt(0).toUpperCase()}
          </span>
          <span className={`max-w-[5rem] truncate text-xs font-semibold ${isWinner ? 'text-slate-900' : 'text-slate-100'}`}>
            {player.name}
            {isYou && <span className="ml-1 text-[0.55rem] text-sky-300">(you)</span>}
          </span>
        </div>
        <span className={`font-mono text-xs tabular-nums ${isWinner ? 'text-slate-900' : 'text-amber-200'}`}>
          {player.chips.toLocaleString()}
        </span>
        {player.loan > 0 && (
          <span className="font-mono text-[0.6rem] text-rose-400">loan −{player.loan.toLocaleString()}</span>
        )}

        <div className="absolute -top-2 right-1 flex gap-0.5">
          {player.smallBlind && <Badge className="bg-sky-600">SB</Badge>}
          {player.bigBlind && <Badge className="bg-indigo-600">BB</Badge>}
        </div>

        <AnimatePresence>
          {player.allIn && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -bottom-2 rounded-full bg-rose-600 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white"
            >
              All-In
            </motion.span>
          )}
          {player.sittingOut && (
            <span className="absolute -bottom-2 rounded-full bg-slate-600 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-slate-200">
              Away
            </span>
          )}
          {player.folded && !player.sittingOut && (
            <span className="absolute -bottom-2 rounded-full bg-slate-700 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-slate-300">
              Folded
            </span>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {isWinner && winningHandName && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded bg-amber-400 px-2 py-0.5 text-[0.6rem] font-bold text-slate-900"
          >
            {winningHandName}
          </motion.span>
        )}
      </AnimatePresence>

      <div className="h-6">{player.currentBet > 0 && <ChipStack amount={player.currentBet} compact />}</div>
    </motion.div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded px-1 py-0.5 text-[0.5rem] font-bold leading-none text-white ${className}`}>
      {children}
    </span>
  );
}
