import type { Card, GameState, Player } from './types';
import { commitChips } from './betting';
import { isSeated, nextSeatIndex, firstSeatIndexFrom, canAct } from './turnManager';

/**
 * Dealer responsibilities: button rotation, blind assignment, and dealing hole
 * and community cards. Includes correct heads-up (2-player) position rules.
 */

/** Number of players still in the game (not eliminated). */
export function countSeated(players: readonly Player[]): number {
  return players.filter(isSeated).length;
}

/** Next seated seat index clockwise from `fromIndex`. */
export function rotateButton(players: readonly Player[], fromIndex: number): number {
  const next = nextSeatIndex(players, fromIndex, isSeated);
  return next === -1 ? firstSeatIndexFrom(players, 0, isSeated) : next;
}

/** Draw a single card off the top of the deck (mutates the deck). */
function draw(deck: Card[]): Card {
  const card = deck.shift();
  if (!card) throw new Error('Deck exhausted while dealing');
  return card;
}

/**
 * Assign the dealer button, small blind, and big blind, then post the blinds.
 * Sets the per-player position flags and initialises the pre-flop betting
 * fields (`currentBet`, `minRaise`, `reopenLevel`, `currentPlayerIndex`).
 *
 * Mutates the provided (draft) state. Expects `state.dealerIndex` to already
 * point at a seated player.
 */
export function assignButtonAndBlinds(state: GameState): void {
  const { players } = state;
  const seated = countSeated(players);

  for (const player of players) {
    player.dealer = false;
    player.smallBlind = false;
    player.bigBlind = false;
  }

  const dealerIdx = state.dealerIndex;
  players[dealerIdx].dealer = true;

  let smallBlindIdx: number;
  let bigBlindIdx: number;
  let firstToActIdx: number;

  if (seated === 2) {
    // Heads-up: the button is the small blind and acts first pre-flop.
    smallBlindIdx = dealerIdx;
    bigBlindIdx = nextSeatIndex(players, dealerIdx, isSeated);
    firstToActIdx = dealerIdx;
  } else {
    smallBlindIdx = nextSeatIndex(players, dealerIdx, isSeated);
    bigBlindIdx = nextSeatIndex(players, smallBlindIdx, isSeated);
    firstToActIdx = nextSeatIndex(players, bigBlindIdx, isSeated);
  }

  players[smallBlindIdx].smallBlind = true;
  players[bigBlindIdx].bigBlind = true;

  // Post blinds (capped at stack → short blinds go all-in).
  commitChips(players[smallBlindIdx], state.smallBlindAmount);
  commitChips(players[bigBlindIdx], state.bigBlindAmount);

  state.currentBet = state.bigBlindAmount;
  state.minRaise = state.bigBlindAmount;
  state.reopenLevel = state.bigBlindAmount;
  state.lastAggressorId = players[bigBlindIdx].id;

  // The blinds are forced, not voluntary actions — the big blind retains the
  // option to raise, so neither blind is marked as having acted.
  players[smallBlindIdx].hasActedThisRound = false;
  players[bigBlindIdx].hasActedThisRound = false;

  state.currentPlayerIndex = firstToActIdx;
}

/**
 * Deal two hole cards to every player in the hand, one at a time in rotation
 * starting left of the button — exactly as a live deal proceeds.
 */
export function dealHoleCards(state: GameState): void {
  const order: number[] = [];
  const start = nextSeatIndex(state.players, state.dealerIndex, isSeated);
  const n = state.players.length;
  for (let step = 0; step < n; step++) {
    const idx = (start + step) % n;
    if (isSeated(state.players[idx])) order.push(idx);
  }

  for (let round = 0; round < 2; round++) {
    for (const idx of order) {
      state.players[idx].holeCards.push(draw(state.deck));
    }
  }
}

/** Burn one card and reveal `count` community cards (mutates state). */
function burnAndReveal(state: GameState, count: number): void {
  draw(state.deck); // burn
  for (let i = 0; i < count; i++) {
    state.communityCards.push(draw(state.deck));
  }
}

export function dealFlop(state: GameState): void {
  burnAndReveal(state, 3);
}

export function dealTurn(state: GameState): void {
  burnAndReveal(state, 1);
}

export function dealRiver(state: GameState): void {
  burnAndReveal(state, 1);
}

/**
 * Seat index of the first player to act on a post-flop street: the first player
 * who can act, scanning clockwise from the button. (Heads-up this is the big
 * blind / non-button; multi-way it is the small blind or the next live seat.)
 */
export function firstToActPostFlop(state: GameState): number {
  return firstSeatIndexFrom(
    state.players,
    (state.dealerIndex + 1) % state.players.length,
    canAct,
  );
}
