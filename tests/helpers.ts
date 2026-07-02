import type { Card, Player, PlayerSeed, Rank, Suit } from '@/lib/poker';

/**
 * Test helpers: terse card construction and player factories. Not a test file
 * (no `.test.ts` suffix) so the runner ignores it.
 */

const SUIT_BY_CHAR: Readonly<Record<string, Suit>> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
};

const RANK_BY_TOKEN: Readonly<Record<string, Rank>> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** Parse a compact card token such as "As", "Td", "10h", "2c". */
export function c(token: string): Card {
  const suitChar = token.slice(-1).toLowerCase();
  const rankToken = token.slice(0, -1).toUpperCase();
  const suit = SUIT_BY_CHAR[suitChar];
  const rank = RANK_BY_TOKEN[rankToken];
  if (!suit || !rank) throw new Error(`Bad card token: ${token}`);
  return { rank, suit };
}

/** Parse many tokens at once. */
export function cards(...tokens: string[]): Card[] {
  return tokens.map(c);
}

/** Build a player with sensible defaults for unit tests. */
export function makePlayer(overrides: Partial<Player> & { id: string; seatIndex: number }): Player {
  return {
    name: overrides.id,
    chips: 0,
    loan: 0,
    holeCards: [],
    currentBet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    dealer: false,
    smallBlind: false,
    bigBlind: false,
    active: true,
    eliminated: false,
    sittingOut: false,
    hasActedThisRound: false,
    isAI: false,
    difficulty: null,
    ...overrides,
  };
}

export function makeSeeds(count: number, aiFrom = 1): PlayerSeed[] {
  const seeds: PlayerSeed[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      id: `p${i}`,
      name: `P${i}`,
      isAI: i >= aiFrom,
      difficulty: i >= aiFrom ? 'medium' : null,
    });
  }
  return seeds;
}
