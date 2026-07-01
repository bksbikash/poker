import type { Card, Deck, Rank, Suit } from './types';

/** All four suits in a canonical order. */
export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** All thirteen ranks, low to high (ace high = 14). */
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_LABELS: Readonly<Record<Rank, string>> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

const RANK_NAMES: Readonly<Record<Rank, string>> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

const RANK_NAMES_PLURAL: Readonly<Record<Rank, string>> = {
  2: 'Twos',
  3: 'Threes',
  4: 'Fours',
  5: 'Fives',
  6: 'Sixes',
  7: 'Sevens',
  8: 'Eights',
  9: 'Nines',
  10: 'Tens',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
  14: 'Aces',
};

const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

/** Short label such as "A" or "10". */
export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank];
}

/** Singular full name such as "Ace". */
export function rankName(rank: Rank): string {
  return RANK_NAMES[rank];
}

/** Plural full name such as "Aces". */
export function rankNamePlural(rank: Rank): string {
  return RANK_NAMES_PLURAL[rank];
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

/** Red suits render red; black suits render dark. */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** Stable, unique string id for a card — used for React keys and dedupe checks. */
export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

/** Compact human label such as "A♠". */
export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;
}

/**
 * Build a fresh, ordered 52-card deck. No jokers. Every (rank, suit) pair
 * appears exactly once, which guarantees no duplicate cards downstream.
 */
export function createDeck(): Deck {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Verify a set of cards contains no duplicates. Used as a runtime invariant
 * guard in the engine (defence in depth — the deck construction already
 * prevents duplicates).
 */
export function hasNoDuplicates(cards: readonly Card[]): boolean {
  const seen = new Set<string>();
  for (const card of cards) {
    const id = cardId(card);
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}
