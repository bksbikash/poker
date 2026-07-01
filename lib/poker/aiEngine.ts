import type { Card, Difficulty, GameState, LegalActions, Player, PlayerAction } from './types';
import { getLegalActions } from './betting';
import { evaluateBestHand } from './handEvaluator';
import { totalCommitted } from './sidePotManager';
import { countInHand } from './turnManager';
import type { RandomSource } from './shuffle';

/**
 * Heuristic AI opponents with three difficulty levels. Decisions are driven by
 * real signals — hole-card strength (Chen formula), made-hand strength, pot
 * odds, opponent count, and position — combined with difficulty-tuned
 * aggression and bluff frequencies. Every returned action is validated against
 * {@link getLegalActions} so the AI can never make an illegal move.
 */

interface AIProfile {
  /** Probability weight applied to betting/raising decisions. */
  readonly aggression: number;
  /** Probability of representing a hand it does not have. */
  readonly bluff: number;
  /** Equity edge (strength − pot odds) below which it folds to a bet. */
  readonly callMargin: number;
  /** Loose, sticky play (calling station) — used by the easy bot. */
  readonly callStation: boolean;
  /** Whether late position nudges aggression upward. */
  readonly positionAware: boolean;
}

const PROFILES: Readonly<Record<Difficulty, AIProfile>> = {
  easy: { aggression: 0.18, bluff: 0.03, callMargin: -0.2, callStation: true, positionAware: false },
  medium: { aggression: 0.42, bluff: 0.08, callMargin: -0.02, callStation: false, positionAware: false },
  hard: { aggression: 0.66, bluff: 0.15, callMargin: 0.0, callStation: false, positionAware: true },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* -------------------------------------------------------------------------- */
/*  Hand strength                                                             */
/* -------------------------------------------------------------------------- */

const CHEN_HIGH: Readonly<Record<number, number>> = {
  14: 10,
  13: 8,
  12: 7,
  11: 6,
};

/** Chen-formula point value for a single high card. */
function chenCardValue(rank: number): number {
  return CHEN_HIGH[rank] ?? rank / 2;
}

/**
 * Pre-flop hole-card strength in [0, 1] via the Chen formula. Captures pairs,
 * suitedness, connectedness and high-card value — the standard starting-hand
 * heuristic.
 */
export function preflopStrength(holeCards: readonly Card[]): number {
  if (holeCards.length < 2) return 0;
  const [a, b] = [...holeCards].sort((x, y) => y.rank - x.rank);
  let score = chenCardValue(a.rank);

  if (a.rank === b.rank) {
    // Pair: twice the card value, minimum 5.
    score = Math.max(score * 2, 5);
  } else {
    if (a.suit === b.suit) score += 2; // suited
    const gap = a.rank - b.rank - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    // Straight bonus for connectors below queen.
    if (gap <= 1 && a.rank < 12) score += 1;
  }

  return clamp(score / 20, 0, 1);
}

/**
 * Post-flop made-hand strength in [0, 1]. Categorises the current best five
 * cards and nudges within the category by the leading tie-breaker so that, for
 * example, top pair beats bottom pair.
 */
export function madeHandStrength(holeCards: readonly Card[], community: readonly Card[]): number {
  const result = evaluateBestHand(holeCards, community);
  const base = (result.rank - 1) / 9; // 0 = high card … 1 = royal flush
  const lead = result.tiebreakers[0] ?? 0;
  const withinCategory = (lead / 14) * (1 / 9) * 0.6;
  return clamp(base + withinCategory, 0, 1);
}

function estimateStrength(state: GameState, player: Player): number {
  if (player.holeCards.length < 2) return 0;
  return state.communityCards.length === 0
    ? preflopStrength(player.holeCards)
    : madeHandStrength(player.holeCards, state.communityCards);
}

/* -------------------------------------------------------------------------- */
/*  Decision making                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Decide the AI player's action for the current state. Pure given `rng`.
 */
export function decideAction(
  state: GameState,
  playerId: string,
  rng: RandomSource = Math.random,
): PlayerAction {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { type: 'fold' };

  const legal = getLegalActions(state, playerId);
  if (!legal.canFold && !legal.canCheck && !legal.canCall && !legal.canBet && !legal.canRaise) {
    return { type: 'check' };
  }

  const profile = PROFILES[player.difficulty ?? 'medium'];
  const pot = totalCommitted(state.players);
  const toCall = legal.callAmount;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

  let strength = estimateStrength(state, player);

  // Occasionally bluff: behave as if holding a strong hand.
  const isBluff = rng() < profile.bluff;
  if (isBluff) strength = Math.max(strength, 0.72 + rng() * 0.2);

  // More opponents devalue marginal holdings.
  const opponents = Math.max(0, countInHand(state.players) - 1);
  if (opponents > 1) strength *= 1 - Math.min(0.28, (opponents - 1) * 0.06);

  // Late position (close to the button) earns a small aggression bump.
  if (profile.positionAware && isLatePosition(state, player)) {
    strength = clamp(strength + 0.05, 0, 1);
  }

  /* ----- No bet to call: check or bet for value / as a bluff ----- */
  if (toCall === 0) {
    const wantsToBet = strength > 0.6 || rng() < profile.aggression * strength;
    if (legal.canBet && wantsToBet) {
      return sizedAggression(state, legal, pot, strength, rng);
    }
    return { type: 'check' };
  }

  /* ----- Facing a bet ----- */

  // Premium hands raise for value.
  const wantsToRaise = strength > 0.82 || (strength > 0.6 && rng() < profile.aggression);
  if (legal.canRaise && wantsToRaise) {
    return sizedAggression(state, legal, pot, strength, rng);
  }

  // Pot-odds based calling decision.
  const equityEdge = strength - potOdds;
  const allInToCall = toCall >= player.chips;

  const shouldCall =
    equityEdge >= profile.callMargin || (profile.callStation && rng() < 0.6 && !allInToCall);

  if (shouldCall && legal.canCall) {
    if (allInToCall && strength < 0.5 && !profile.callStation) {
      return { type: 'fold' };
    }
    return { type: 'call' };
  }

  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

/** Build a legal bet/raise, escalating to all-in when nearly committed. */
function sizedAggression(
  state: GameState,
  legal: LegalActions,
  pot: number,
  strength: number,
  rng: RandomSource,
): PlayerAction {
  const fraction = strength > 0.9 ? 1.0 : strength > 0.75 ? 0.75 : 0.55;
  let target = Math.max(legal.minRaiseTo, state.currentBet + Math.round(pot * fraction));
  target = Math.min(target, legal.maxRaiseTo);

  const nearlyAllIn = legal.maxRaiseTo - target < state.bigBlindAmount;
  const shoveStrong = strength > 0.92 && rng() < 0.6;
  if (legal.canAllIn && (target >= legal.maxRaiseTo || nearlyAllIn || shoveStrong)) {
    return { type: 'allIn' };
  }

  if (state.currentBet === 0) {
    if (legal.canBet) return { type: 'bet', amount: target };
    return { type: 'check' };
  }
  if (legal.canRaise) return { type: 'raise', amount: target };
  return legal.canCall ? { type: 'call' } : { type: 'check' };
}

/** A player is in late position if within two seats clockwise of the button. */
function isLatePosition(state: GameState, player: Player): boolean {
  const n = state.players.length;
  const distanceFromButton = (player.seatIndex - state.dealerIndex + n) % n;
  return distanceFromButton === 0 || distanceFromButton >= n - 2;
}
