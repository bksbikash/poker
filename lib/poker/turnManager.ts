import type { GameState, Player } from './types';

/**
 * Turn ordering and betting-round lifecycle.
 *
 * All seat traversal is clockwise (increasing seat index, wrapping). Eliminated
 * players keep their seat index but are skipped, so positions stay stable.
 */

/** Player can voluntarily act: in the hand, not folded, not all-in, has chips. */
export function canAct(player: Player): boolean {
  return (
    player.active &&
    !player.eliminated &&
    !player.folded &&
    !player.allIn &&
    player.chips > 0
  );
}

/** Player still has a live stake in the pot (includes all-in players). */
export function isInHand(player: Player): boolean {
  return player.active && !player.eliminated && !player.folded;
}

/** Player is seated and part of the game (not busted out). */
export function isSeated(player: Player): boolean {
  return !player.eliminated;
}

/**
 * Find the next seat index after `fromIndex` (exclusive) whose player matches
 * `predicate`, scanning clockwise. Returns -1 if none match.
 */
export function nextSeatIndex(
  players: readonly Player[],
  fromIndex: number,
  predicate: (player: Player) => boolean,
): number {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const index = (fromIndex + step) % n;
    if (predicate(players[index])) return index;
  }
  return -1;
}

/**
 * Find the first seat index at or after `fromIndex` (inclusive) matching
 * `predicate`, scanning clockwise. Returns -1 if none match.
 */
export function firstSeatIndexFrom(
  players: readonly Player[],
  fromIndex: number,
  predicate: (player: Player) => boolean,
): number {
  const n = players.length;
  for (let step = 0; step < n; step++) {
    const index = (fromIndex + step) % n;
    if (predicate(players[index])) return index;
  }
  return -1;
}

/** Does this player still owe action in the current betting round? */
export function needsToAct(player: Player, currentBet: number): boolean {
  if (!canAct(player)) return false;
  if (!player.hasActedThisRound) return true;
  return player.currentBet < currentBet;
}

/**
 * The betting round is complete when no player who can act still owes action —
 * everyone has acted and matched the current bet (or folded / gone all-in).
 */
export function isBettingRoundComplete(state: GameState): boolean {
  const live = state.players.filter(isInHand);
  if (live.length <= 1) return true; // hand is effectively decided

  // If at most one player can still act and they have matched, betting is over.
  return state.players.every((p) => !needsToAct(p, state.currentBet));
}

/**
 * Index of the next player who must act after the current one, or -1 if the
 * round is complete.
 */
export function nextToAct(state: GameState): number {
  if (isBettingRoundComplete(state)) return -1;
  const from = state.currentPlayerIndex < 0 ? state.dealerIndex : state.currentPlayerIndex;
  return nextSeatIndex(state.players, from, (p) => needsToAct(p, state.currentBet));
}

/** Count of players still in the hand (not folded / eliminated). */
export function countInHand(players: readonly Player[]): number {
  return players.filter(isInHand).length;
}

/** Count of players who can still voluntarily act. */
export function countCanAct(players: readonly Player[]): number {
  return players.filter(canAct).length;
}
