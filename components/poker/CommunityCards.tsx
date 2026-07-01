'use client';

import type { Card } from '@/lib/poker';
import { cardId } from '@/lib/poker';
import { PlayingCard } from './PlayingCard';

interface CommunityCardsProps {
  cards: readonly Card[];
  /** Card ids belonging to the winning hand, highlighted at showdown. */
  highlightedIds?: ReadonlySet<string>;
}

/** The five-card board, revealed flop → turn → river with a deal stagger. */
export function CommunityCards({ cards, highlightedIds }: CommunityCardsProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
      {Array.from({ length: 5 }).map((_, index) => {
        const card = cards[index];
        if (!card) {
          return (
            <div
              key={`slot-${index}`}
              className="h-16 w-11 rounded-md border border-white/10 bg-white/5 sm:h-[4.5rem] sm:w-12"
            />
          );
        }
        // Flop (0–2) deals together; turn and river each stagger after.
        const dealDelay = index < 3 ? index * 0.12 : 0.1;
        return (
          <PlayingCard
            key={cardId(card)}
            card={card}
            size="md"
            dealDelay={dealDelay}
            highlight={highlightedIds?.has(cardId(card))}
          />
        );
      })}
    </div>
  );
}
