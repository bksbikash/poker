import type { Card, HandResult, Player, Pot, PotAward, PotWinner } from './types';
import { evaluateBestHand, compareHands } from './handEvaluator';

/**
 * Showdown resolution: evaluate every eligible player's best hand per pot,
 * determine the winner(s), and split each pot exactly — including correct
 * odd-chip distribution.
 */

/**
 * Determine pot awards for a showdown. Pure: returns the awards without
 * mutating players. The caller credits chips from the returned shares.
 *
 * @param pots           ordered pots (main first) from the side-pot manager
 * @param players        all players in the hand
 * @param communityCards the five board cards
 * @param dealerIndex    seat index of the button (for odd-chip ordering)
 */
export function resolveShowdown(
  pots: readonly Pot[],
  players: readonly Player[],
  communityCards: readonly Card[],
  dealerIndex: number,
): PotAward[] {
  const playerById = new Map<string, Player>(players.map((p) => [p.id, p]));

  // Evaluate each contender's hand once and memoise.
  const handCache = new Map<string, HandResult>();
  const handOf = (playerId: string): HandResult => {
    const cached = handCache.get(playerId);
    if (cached) return cached;
    const player = playerById.get(playerId);
    if (!player) throw new Error(`Unknown player in pot: ${playerId}`);
    const hand = evaluateBestHand(player.holeCards, communityCards);
    handCache.set(playerId, hand);
    return hand;
  };

  const seatCount = players.length;
  // Position order for the odd chip: closest to the left of the button first.
  const positionKey = (player: Player): number =>
    (player.seatIndex - dealerIndex - 1 + seatCount) % seatCount;

  const awards: PotAward[] = [];

  pots.forEach((pot, potIndex) => {
    const contenders = pot.eligiblePlayerIds
      .map((id) => playerById.get(id))
      .filter((p): p is Player => p !== undefined && !p.folded);

    if (contenders.length === 0) {
      // No eligible winner (degenerate). Record an empty award; the engine's
      // uncalled-bet return prevents this in normal play.
      awards.push({ potIndex, amount: pot.amount, isMain: pot.isMain, winners: [] });
      return;
    }

    // Find the best hand and everyone tied with it.
    let best: HandResult = handOf(contenders[0].id);
    for (const player of contenders.slice(1)) {
      const hand = handOf(player.id);
      if (compareHands(hand, best) > 0) best = hand;
    }
    const winners = contenders
      .filter((player) => compareHands(handOf(player.id), best) === 0)
      .sort((a, b) => positionKey(a) - positionKey(b));

    awards.push({
      potIndex,
      amount: pot.amount,
      isMain: pot.isMain,
      winners: splitPot(pot.amount, winners, handOf),
    });
  });

  return awards;
}

/**
 * Split `amount` among the tied `winners`. Each gets the floored even share;
 * the indivisible remainder is dealt one chip at a time to the winners in the
 * order provided (earliest position first), matching standard house rules.
 */
function splitPot(
  amount: number,
  winners: readonly Player[],
  handOf: (id: string) => HandResult,
): PotWinner[] {
  const n = winners.length;
  const baseShare = Math.floor(amount / n);
  let remainder = amount - baseShare * n;

  return winners.map((player) => {
    let share = baseShare;
    if (remainder > 0) {
      share += 1;
      remainder -= 1;
    }
    return { playerId: player.id, share, hand: handOf(player.id) };
  });
}

/**
 * Award the entire (uncontested) pot to the single remaining player when
 * everyone else has folded — no hand evaluation needed.
 */
export function resolveUncontested(
  pots: readonly Pot[],
  winnerId: string,
): PotAward[] {
  return pots.map((pot, potIndex) => ({
    potIndex,
    amount: pot.amount,
    isMain: pot.isMain,
    winners: [{ playerId: winnerId, share: pot.amount, hand: null }],
  }));
}
