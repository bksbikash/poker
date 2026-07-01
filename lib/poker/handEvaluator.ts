import type { Card, HandResult, Rank, Suit } from './types';
import { HandRank } from './types';
import { rankName, rankNamePlural } from './deck';

/**
 * Texas Hold'em hand evaluator.
 *
 * Given 5–7 cards it finds the single best 5-card poker hand and returns a
 * fully comparable {@link HandResult}. Correctly handles:
 *   - all nine standard categories plus Royal Flush,
 *   - ace-high and the ace-low "wheel" straight (A-2-3-4-5),
 *   - kickers and exact tie-breakers,
 *   - which is essential for split-pot detection downstream.
 *
 * The implementation is a direct categorical evaluation (no 21-combination
 * brute force) so it is both fast and easy to verify.
 */

/* -------------------------------------------------------------------------- */
/*  Comparison                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compare two evaluated hands.
 * @returns positive if `a` is stronger, negative if `b` is stronger, 0 on a
 *          true tie (equal category and identical tie-breakers → split pot).
 */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

interface RankGroup {
  readonly rank: Rank;
  readonly count: number;
  readonly cards: Card[];
}

/** Descending sort comparator for plain numeric ranks. */
function descNumber(a: number, b: number): number {
  return b - a;
}

/**
 * Highest card of the best straight contained in a rank set, or null. Handles
 * the wheel by letting an ace (14) also count as 1; in that case the returned
 * high card is 5.
 */
function bestStraightHigh(rankSet: ReadonlySet<number>): number | null {
  const ranks = new Set<number>(rankSet);
  if (ranks.has(14)) ranks.add(1); // ace plays low for the wheel
  for (let high = 14; high >= 5; high--) {
    let run = true;
    for (let k = 0; k < 5; k++) {
      if (!ranks.has(high - k)) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return null;
}

/** Pick concrete cards forming the straight ending at `high` from a pool. */
function pickStraightCards(pool: readonly Card[], high: number): Card[] {
  const neededRanks: number[] =
    high === 5 ? [5, 4, 3, 2, 14] : [high, high - 1, high - 2, high - 3, high - 4];
  const out: Card[] = [];
  for (const r of neededRanks) {
    const card = pool.find((c) => c.rank === r);
    if (card) out.push(card);
  }
  return out;
}

/** Highest `count` cards (one per rank, by rank desc) excluding given ranks. */
function pickKickers(
  cards: readonly Card[],
  excludeRanks: ReadonlySet<number>,
  count: number,
): Card[] {
  const seen = new Set<number>();
  const candidates: Card[] = [];
  for (const c of [...cards].sort((a, b) => descNumber(a.rank, b.rank))) {
    if (excludeRanks.has(c.rank) || seen.has(c.rank)) continue;
    seen.add(c.rank);
    candidates.push(c);
    if (candidates.length === count) break;
  }
  return candidates;
}

/* -------------------------------------------------------------------------- */
/*  Main evaluation                                                           */
/* -------------------------------------------------------------------------- */

export function evaluateHand(input: readonly Card[]): HandResult {
  if (input.length < 5) {
    throw new Error(`evaluateHand requires at least 5 cards, got ${input.length}`);
  }

  // Group by rank and suit.
  const cardsByRank = new Map<Rank, Card[]>();
  const cardsBySuit = new Map<Suit, Card[]>();
  for (const card of input) {
    const r = cardsByRank.get(card.rank);
    if (r) r.push(card);
    else cardsByRank.set(card.rank, [card]);
    const s = cardsBySuit.get(card.suit);
    if (s) s.push(card);
    else cardsBySuit.set(card.suit, [card]);
  }

  // Rank groups sorted by count desc, then rank desc — the natural priority
  // for pairs/trips/quads.
  const groups: RankGroup[] = [...cardsByRank.entries()]
    .map(([rank, cards]) => ({ rank, count: cards.length, cards }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.rank - a.rank));

  const allRankSet = new Set<number>(input.map((c) => c.rank));

  // Detect a flush (at most one suit can hold ≥5 of 7 cards).
  let flushCards: Card[] | null = null;
  for (const cards of cardsBySuit.values()) {
    if (cards.length >= 5) {
      flushCards = [...cards].sort((a, b) => descNumber(a.rank, b.rank));
      break;
    }
  }

  /* ----- Straight flush / Royal flush ----- */
  if (flushCards) {
    const flushRankSet = new Set<number>(flushCards.map((c) => c.rank));
    const sfHigh = bestStraightHigh(flushRankSet);
    if (sfHigh !== null) {
      const cards = pickStraightCards(flushCards, sfHigh);
      if (sfHigh === 14) {
        return {
          rank: HandRank.RoyalFlush,
          name: 'Royal Flush',
          description: `Royal Flush, ${suitWord(cards)}`,
          cards,
          tiebreakers: [14],
        };
      }
      return {
        rank: HandRank.StraightFlush,
        name: 'Straight Flush',
        description: `Straight Flush, ${rankName(toRank(sfHigh))} high`,
        cards,
        tiebreakers: [sfHigh],
      };
    }
  }

  const quads = groups.find((g) => g.count === 4);
  const trips = groups.filter((g) => g.count === 3);
  const pairs = groups.filter((g) => g.count === 2);

  /* ----- Four of a kind ----- */
  if (quads) {
    const kicker = pickKickers(input, new Set([quads.rank]), 1);
    return {
      rank: HandRank.FourOfAKind,
      name: 'Four of a Kind',
      description: `Four of a Kind, ${rankNamePlural(quads.rank)}`,
      cards: [...quads.cards, ...kicker],
      tiebreakers: [quads.rank, kicker[0]?.rank ?? 0],
    };
  }

  /* ----- Full house ----- */
  if (trips.length >= 1 && (trips.length >= 2 || pairs.length >= 1)) {
    const tripsGroup = trips[0];
    // The pair half is the best of: a second set of trips, or the best pair.
    const pairCandidates: RankGroup[] = [...trips.slice(1), ...pairs].sort(
      (a, b) => b.rank - a.rank,
    );
    const pairGroup = pairCandidates[0];
    return {
      rank: HandRank.FullHouse,
      name: 'Full House',
      description: `Full House, ${rankNamePlural(tripsGroup.rank)} full of ${rankNamePlural(
        pairGroup.rank,
      )}`,
      cards: [...tripsGroup.cards, ...pairGroup.cards.slice(0, 2)],
      tiebreakers: [tripsGroup.rank, pairGroup.rank],
    };
  }

  /* ----- Flush ----- */
  if (flushCards) {
    const best = flushCards.slice(0, 5);
    return {
      rank: HandRank.Flush,
      name: 'Flush',
      description: `Flush, ${rankName(best[0].rank)} high`,
      cards: best,
      tiebreakers: best.map((c) => c.rank),
    };
  }

  /* ----- Straight ----- */
  const straightHigh = bestStraightHigh(allRankSet);
  if (straightHigh !== null) {
    const cards = pickStraightCards(input, straightHigh);
    return {
      rank: HandRank.Straight,
      name: 'Straight',
      description: `Straight, ${rankName(toRank(straightHigh))} high`,
      cards,
      tiebreakers: [straightHigh],
    };
  }

  /* ----- Three of a kind ----- */
  if (trips.length >= 1) {
    const tripsGroup = trips[0];
    const kickers = pickKickers(input, new Set([tripsGroup.rank]), 2);
    return {
      rank: HandRank.ThreeOfAKind,
      name: 'Three of a Kind',
      description: `Three of a Kind, ${rankNamePlural(tripsGroup.rank)}`,
      cards: [...tripsGroup.cards, ...kickers],
      tiebreakers: [tripsGroup.rank, ...kickers.map((c) => c.rank)],
    };
  }

  /* ----- Two pair ----- */
  if (pairs.length >= 2) {
    const [highPair, lowPair] = pairs;
    const kicker = pickKickers(input, new Set([highPair.rank, lowPair.rank]), 1);
    return {
      rank: HandRank.TwoPair,
      name: 'Two Pair',
      description: `Two Pair, ${rankNamePlural(highPair.rank)} and ${rankNamePlural(
        lowPair.rank,
      )}`,
      cards: [...highPair.cards, ...lowPair.cards, ...kicker],
      tiebreakers: [highPair.rank, lowPair.rank, kicker[0]?.rank ?? 0],
    };
  }

  /* ----- One pair ----- */
  if (pairs.length === 1) {
    const pair = pairs[0];
    const kickers = pickKickers(input, new Set([pair.rank]), 3);
    return {
      rank: HandRank.OnePair,
      name: 'One Pair',
      description: `One Pair, ${rankNamePlural(pair.rank)}`,
      cards: [...pair.cards, ...kickers],
      tiebreakers: [pair.rank, ...kickers.map((c) => c.rank)],
    };
  }

  /* ----- High card ----- */
  const high = pickKickers(input, new Set<number>(), 5);
  return {
    rank: HandRank.HighCard,
    name: 'High Card',
    description: `High Card, ${rankName(high[0].rank)}`,
    cards: high,
    tiebreakers: high.map((c) => c.rank),
  };
}

/** Convenience: evaluate the best hand from hole + community cards. */
export function evaluateBestHand(
  holeCards: readonly Card[],
  communityCards: readonly Card[],
): HandResult {
  return evaluateHand([...holeCards, ...communityCards]);
}

/* -------------------------------------------------------------------------- */
/*  Small typing helpers                                                      */
/* -------------------------------------------------------------------------- */

/** Narrow a known-valid straight high value (5–14) back to a `Rank`. */
function toRank(value: number): Rank {
  return value as Rank;
}

/** Describe the suit of a completed flush for the royal-flush label. */
function suitWord(cards: readonly Card[]): string {
  const suit = cards[0]?.suit ?? 'spades';
  return `${suit.charAt(0).toUpperCase()}${suit.slice(1)}`;
}
