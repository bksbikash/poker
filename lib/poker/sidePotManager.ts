import type { Player, Pot } from './types';

/**
 * Side-pot construction and uncalled-bet handling — the heart of exact chip
 * accounting. Works purely from each player's `totalBet` (chips committed to
 * the whole hand) and `folded` flag.
 */

/**
 * Return any uncalled bet to its owner.
 *
 * The single highest contributor may have wagered more than anyone else could
 * match (because every other live player folded or is all-in for less). That
 * excess was never called, so by the rules it is refunded.
 *
 * Mutates the provided players in place (chips refunded, `totalBet`/`currentBet`
 * reduced) and returns the amount refunded together with the player id. Safe to
 * call repeatedly — it is a no-op once everything is matched.
 */
export function returnUncalledBet(players: Player[]): { playerId: string; amount: number } | null {
  const contributors = players.filter((p) => p.totalBet > 0);
  if (contributors.length === 0) return null;

  const totals = contributors.map((p) => p.totalBet).sort((a, b) => b - a);
  const top = totals[0];
  const second = totals[1] ?? 0;
  if (top <= second) return null; // top is matched by at least one other player

  // Exactly one player holds the strict maximum (ties would mean top===second).
  const owner = contributors.find((p) => p.totalBet === top);
  if (!owner) return null;

  const refund = top - second;
  owner.chips += refund;
  owner.totalBet -= refund;
  owner.currentBet = Math.max(0, owner.currentBet - refund);
  if (owner.chips > 0) owner.allIn = false; // refund can un-do an all-in
  return { playerId: owner.id, amount: refund };
}

/**
 * Build the ordered list of pots (main pot first, then side pots) from player
 * contributions. Folded players' chips remain in the pots they funded but they
 * are excluded from each pot's eligible-winner list.
 *
 * The algorithm walks the distinct contribution levels from low to high; each
 * level forms a "layer" funded by everyone who contributed at least that much.
 * Adjacent layers with identical eligible sets are merged for tidiness.
 */
export function buildPots(players: readonly Player[]): Pot[] {
  const contributors = players.filter((p) => p.totalBet > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((p) => p.totalBet))].sort((a, b) => a - b);

  const raw: Pot[] = [];
  let previousLevel = 0;
  for (const level of levels) {
    const layer = level - previousLevel;
    const atLeast = contributors.filter((p) => p.totalBet >= level);
    const amount = layer * atLeast.length;
    if (amount > 0) {
      const eligible = atLeast.filter((p) => !p.folded).map((p) => p.id);
      raw.push({ amount, eligiblePlayerIds: eligible, isMain: false });
    }
    previousLevel = level;
  }

  return mergeAdjacentPots(raw);
}

/** Merge neighbouring pots whose eligible-winner sets are identical. */
function mergeAdjacentPots(pots: readonly Pot[]): Pot[] {
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameEligibility(last.eligiblePlayerIds, pot.eligiblePlayerIds)) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot, eligiblePlayerIds: [...pot.eligiblePlayerIds] });
    }
  }
  // The first pot is by definition the main pot.
  return merged.map((pot, index) => ({ ...pot, isMain: index === 0 }));
}

function sameEligibility(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Total chips currently committed across all players (running pot display). */
export function totalCommitted(players: readonly Player[]): number {
  return players.reduce((sum, p) => sum + p.totalBet, 0);
}
