'use client';

import { motion } from 'framer-motion';
import type { Card, Rank } from '@/lib/poker';
import { rankLabel, suitSymbol, isRedSuit } from '@/lib/poker';

export type CardSize = 'sm' | 'md' | 'lg';

interface PlayingCardProps {
  card?: Card | null;
  /** Render the back of the card (hidden hole cards). */
  faceDown?: boolean;
  size?: CardSize;
  /** Stagger delay (seconds) for the deal-in animation. */
  dealDelay?: number;
  /** Emphasise the card as part of the winning hand. */
  highlight?: boolean;
  className?: string;
}

const SIZE_CLASSES: Readonly<Record<CardSize, string>> = {
  sm: 'w-9 h-[3.25rem] sm:w-10 sm:h-14',
  md: 'w-12 h-[4.5rem] sm:w-[3.5rem] sm:h-[5rem]',
  lg: 'w-16 h-24 sm:w-[4.75rem] sm:h-[6.75rem]',
};

const INDEX_TEXT: Readonly<Record<CardSize, string>> = {
  sm: 'text-[0.6rem]',
  md: 'text-xs',
  lg: 'text-sm sm:text-base',
};

const PIP_TEXT: Readonly<Record<CardSize, string>> = {
  sm: 'text-[0.55rem]',
  md: 'text-[0.7rem]',
  lg: 'text-sm',
};

const COURT_TEXT: Readonly<Record<CardSize, string>> = {
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-4xl',
};

/* Pip coordinates as percentages. x: 28 (left) / 50 (centre) / 72 (right).
   Pips below the mid-line are rendered upside-down, as on real cards. */
const L = 28;
const C = 50;
const R = 72;
const PIP_LAYOUT: Readonly<Record<number, { x: number; y: number }[]>> = {
  2: [{ x: C, y: 18 }, { x: C, y: 82 }],
  3: [{ x: C, y: 18 }, { x: C, y: 50 }, { x: C, y: 82 }],
  4: [{ x: L, y: 18 }, { x: R, y: 18 }, { x: L, y: 82 }, { x: R, y: 82 }],
  5: [{ x: L, y: 18 }, { x: R, y: 18 }, { x: C, y: 50 }, { x: L, y: 82 }, { x: R, y: 82 }],
  6: [
    { x: L, y: 18 }, { x: R, y: 18 }, { x: L, y: 50 }, { x: R, y: 50 }, { x: L, y: 82 }, { x: R, y: 82 },
  ],
  7: [
    { x: L, y: 18 }, { x: R, y: 18 }, { x: C, y: 34 }, { x: L, y: 50 }, { x: R, y: 50 },
    { x: L, y: 82 }, { x: R, y: 82 },
  ],
  8: [
    { x: L, y: 18 }, { x: R, y: 18 }, { x: C, y: 34 }, { x: L, y: 50 }, { x: R, y: 50 },
    { x: C, y: 66 }, { x: L, y: 82 }, { x: R, y: 82 },
  ],
  9: [
    { x: L, y: 16 }, { x: R, y: 16 }, { x: L, y: 39 }, { x: R, y: 39 }, { x: C, y: 50 },
    { x: L, y: 61 }, { x: R, y: 61 }, { x: L, y: 84 }, { x: R, y: 84 },
  ],
  10: [
    { x: L, y: 16 }, { x: R, y: 16 }, { x: C, y: 30 }, { x: L, y: 39 }, { x: R, y: 39 },
    { x: L, y: 61 }, { x: R, y: 61 }, { x: C, y: 70 }, { x: L, y: 84 }, { x: R, y: 84 },
  ],
};

function CornerIndex({
  rank,
  suit,
  color,
  size,
  flip = false,
}: {
  rank: Rank;
  suit: Card['suit'];
  color: string;
  size: CardSize;
  flip?: boolean;
}) {
  return (
    <div
      className={`absolute flex flex-col items-center leading-none ${color} ${INDEX_TEXT[size]} font-bold ${
        flip ? 'bottom-0.5 right-0.5 rotate-180' : 'left-0.5 top-0.5'
      }`}
    >
      <span>{rankLabel(rank)}</span>
      <span className="-mt-0.5">{suitSymbol(suit)}</span>
    </div>
  );
}

/** The face of a card: corner indices plus pip/court/ace centre artwork. */
function CardFace({ card, size }: { card: Card; size: CardSize }) {
  const red = isRedSuit(card.suit);
  const color = red ? 'text-red-600' : 'text-slate-900';
  const sym = suitSymbol(card.suit);
  const isCourt = card.rank === 11 || card.rank === 12 || card.rank === 13;
  const isAce = card.rank === 14;
  const pips = PIP_LAYOUT[card.rank];

  return (
    <>
      <CornerIndex rank={card.rank} suit={card.suit} color={color} size={size} />
      <CornerIndex rank={card.rank} suit={card.suit} color={color} size={size} flip />

      {isAce && (
        <div className={`absolute inset-0 flex items-center justify-center ${color}`}>
          <span className={size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-3xl' : 'text-xl'}>
            {sym}
          </span>
        </div>
      )}

      {isCourt && (
        <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-sm border border-slate-300 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.03)_0,rgba(0,0,0,0.03)_3px,transparent_3px,transparent_6px)]">
          <span className={`font-black ${COURT_TEXT[size]} ${color}`}>{rankLabel(card.rank)}</span>
          <span className={`${PIP_TEXT[size]} ${color}`}>{sym}</span>
        </div>
      )}

      {pips &&
        pips.map((pip, i) => (
          <span
            key={i}
            className={`absolute ${PIP_TEXT[size]} ${color}`}
            style={{
              left: `${pip.x}%`,
              top: `${pip.y}%`,
              transform: `translate(-50%, -50%) ${pip.y > 50 ? 'rotate(180deg)' : ''}`,
            }}
          >
            {sym}
          </span>
        ))}
    </>
  );
}

/**
 * A realistic playing card with 3D flip and deal-in animations. When `card` is
 * absent or `faceDown` is set, the patterned back is shown.
 */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  dealDelay = 0,
  highlight = false,
  className = '',
}: PlayingCardProps) {
  const showBack = faceDown || !card;

  return (
    <motion.div
      initial={{ opacity: 0, y: -28, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: dealDelay, type: 'spring', stiffness: 320, damping: 26 }}
      className={`relative ${SIZE_CLASSES[size]} ${className}`}
      style={{ perspective: 800 }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: showBack ? 180 : 0 }}
        transition={{ duration: 0.45, ease: 'easeInOut' }}
      >
        {/* Front face */}
        <div
          className={`absolute inset-0 overflow-hidden rounded-md border bg-white shadow-md ${
            highlight ? 'border-amber-400 ring-2 ring-amber-400' : 'border-slate-300'
          }`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {card && <CardFace card={card} size={size} />}
        </div>

        {/* Back face */}
        <div
          className="absolute inset-0 rounded-md border border-indigo-300/40 bg-gradient-to-br from-indigo-700 to-indigo-950 shadow-md"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="absolute inset-1 rounded-sm border border-indigo-400/30 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.1)_0,rgba(255,255,255,0.1)_3px,transparent_3px,transparent_6px)]" />
          <div className="absolute inset-0 flex items-center justify-center text-indigo-200/40">♠</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
