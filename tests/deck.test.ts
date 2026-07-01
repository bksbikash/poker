import { describe, expect, it } from 'vitest';
import { createDeck, cardId, hasNoDuplicates } from '@/lib/poker';
import { shuffleDeck, createSeededRandom } from '@/lib/poker';

describe('deck', () => {
  it('builds exactly 52 unique cards with no jokers', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardId)).size).toBe(52);
    expect(hasNoDuplicates(deck)).toBe(true);
  });

  it('contains 13 of each suit and 4 of each rank', () => {
    const deck = createDeck();
    const suits = new Map<string, number>();
    const ranks = new Map<number, number>();
    for (const card of deck) {
      suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
      ranks.set(card.rank, (ranks.get(card.rank) ?? 0) + 1);
    }
    expect([...suits.values()]).toEqual([13, 13, 13, 13]);
    expect([...ranks.values()].every((n) => n === 4)).toBe(true);
  });
});

describe('shuffle', () => {
  it('preserves the exact multiset of cards (no dupes, none lost)', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, createSeededRandom(123));
    expect(shuffled).toHaveLength(52);
    expect(hasNoDuplicates(shuffled)).toBe(true);
    expect(new Set(shuffled.map(cardId))).toEqual(new Set(deck.map(cardId)));
  });

  it('does not mutate the input deck', () => {
    const deck = createDeck();
    const snapshot = deck.map(cardId).join(',');
    shuffleDeck(deck, createSeededRandom(7));
    expect(deck.map(cardId).join(',')).toBe(snapshot);
  });

  it('is deterministic for a given seed', () => {
    const a = shuffleDeck(createDeck(), createSeededRandom(999)).map(cardId);
    const b = shuffleDeck(createDeck(), createSeededRandom(999)).map(cardId);
    expect(a).toEqual(b);
  });

  it('produces a different order than sorted for a typical seed', () => {
    const sorted = createDeck().map(cardId);
    const shuffled = shuffleDeck(createDeck(), createSeededRandom(42)).map(cardId);
    expect(shuffled).not.toEqual(sorted);
  });
});
