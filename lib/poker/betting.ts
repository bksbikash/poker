import type { GameState, LegalActions, Player, PlayerAction } from './types';
import { canAct } from './turnManager';

/**
 * The betting engine: legal-action computation, validation, and application.
 *
 * `bet`/`raise` use raise-to semantics — `action.amount` is the *total* the
 * player's `currentBet` should become this round. All chip movement flows
 * through {@link commitChips} so accounting is exact and centralised.
 */

/**
 * Move `amount` chips (capped at the stack) from a player's stack into the pot,
 * updating round and hand totals and flagging all-in. Returns chips committed.
 */
export function commitChips(player: Player, amount: number): number {
  const paid = Math.min(Math.max(0, Math.floor(amount)), player.chips);
  player.chips -= paid;
  player.currentBet += paid;
  player.totalBet += paid;
  if (player.chips === 0 && paid > 0) player.allIn = true;
  return paid;
}

/** Chips the player must add to match the current bet (uncapped). */
export function amountToCall(state: GameState, player: Player): number {
  return Math.max(0, state.currentBet - player.currentBet);
}

/** Minimum legal raise-to total in the current state. */
export function minRaiseTo(state: GameState): number {
  if (state.currentBet === 0) return state.bigBlindAmount; // opening bet
  return state.currentBet + state.minRaise;
}

/**
 * Compute exactly what the given player may legally do right now. The UI and AI
 * both rely on this so that illegal actions are impossible to offer.
 */
export function getLegalActions(state: GameState, playerId: string): LegalActions {
  const player = state.players.find((p) => p.id === playerId);
  const empty: LegalActions = {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    canAllIn: false,
  };
  if (!player || !canAct(player)) return empty;

  const toCall = amountToCall(state, player);
  const callAmount = Math.min(toCall, player.chips);
  const maxTo = player.currentBet + player.chips; // the player's all-in total
  const minTo = minRaiseTo(state);

  // A player may re-raise only if action has been reopened to them: either they
  // have not acted yet, or a *full* raise has occurred above their committed
  // amount since (an incomplete all-in does not reopen).
  const raiseReopened = !player.hasActedThisRound || state.reopenLevel > player.currentBet;

  const canAffordFull = maxTo >= minTo;
  const facingBet = toCall > 0;

  return {
    canFold: true,
    canCheck: toCall === 0,
    canCall: facingBet && player.chips > 0,
    callAmount,
    canBet: !facingBet && state.currentBet === 0 && canAffordFull && player.chips > 0,
    canRaise: facingBet && state.currentBet > 0 && canAffordFull && raiseReopened,
    minRaiseTo: Math.min(minTo, maxTo),
    maxRaiseTo: maxTo,
    canAllIn: player.chips > 0,
  };
}

/** Thrown when a caller attempts an action the rules forbid. */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

/**
 * Validate and apply a betting action, mutating the (draft) state in place.
 * Throws {@link IllegalActionError} for any illegal action — this is the single
 * authoritative guard against checking into a bet, sub-minimum raises, acting
 * out of turn, acting after folding, and invalid chip amounts.
 */
export function applyBettingAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
): void {
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[playerIndex];
  if (!player) throw new IllegalActionError(`Unknown player: ${playerId}`);

  if (state.currentPlayerIndex !== playerIndex) {
    throw new IllegalActionError(`${player.name} acted out of turn`);
  }
  if (!canAct(player)) {
    throw new IllegalActionError(`${player.name} cannot act (folded, all-in, or out)`);
  }

  const legal = getLegalActions(state, playerId);

  switch (action.type) {
    case 'fold': {
      player.folded = true;
      player.active = false;
      player.hasActedThisRound = true;
      break;
    }

    case 'check': {
      if (!legal.canCheck) {
        throw new IllegalActionError(`${player.name} cannot check while facing a bet`);
      }
      player.hasActedThisRound = true;
      break;
    }

    case 'call': {
      if (!legal.canCall) throw new IllegalActionError(`${player.name} has nothing to call`);
      commitChips(player, amountToCall(state, player));
      player.hasActedThisRound = true;
      break;
    }

    case 'bet':
    case 'raise': {
      const target = action.amount ?? 0;
      applyRaiseTo(state, player, target, action.type, legal);
      break;
    }

    case 'allIn': {
      if (player.chips <= 0) throw new IllegalActionError(`${player.name} has no chips`);
      const target = player.currentBet + player.chips;
      if (target > state.currentBet) {
        // All-in functions as a bet/raise.
        applyAllInRaise(state, player, target);
      } else {
        // All-in for less than (or equal to) the call — just a call all-in.
        commitChips(player, player.chips);
        player.hasActedThisRound = true;
      }
      break;
    }

    default: {
      // Exhaustiveness guard.
      const _never: never = action.type;
      throw new IllegalActionError(`Unsupported action: ${String(_never)}`);
    }
  }
}

/** Apply a sized bet or raise to the given target total. */
function applyRaiseTo(
  state: GameState,
  player: Player,
  target: number,
  type: 'bet' | 'raise',
  legal: LegalActions,
): void {
  if (!Number.isFinite(target) || !Number.isInteger(target)) {
    throw new IllegalActionError(`Invalid chip amount: ${target}`);
  }
  if (type === 'bet' && !legal.canBet) {
    throw new IllegalActionError(`${player.name} cannot bet right now`);
  }
  if (type === 'raise' && !legal.canRaise) {
    throw new IllegalActionError(`${player.name} cannot raise right now`);
  }
  if (target > legal.maxRaiseTo) {
    throw new IllegalActionError(`${player.name} cannot wager more than their stack`);
  }
  // A target below the legal minimum is only allowed as an exact all-in, which
  // is handled by the dedicated all-in path — sized bets/raises must meet the
  // minimum.
  if (target < legal.minRaiseTo) {
    throw new IllegalActionError(
      `${player.name} must ${type} to at least ${legal.minRaiseTo}`,
    );
  }

  const raiseSize = target - state.currentBet;
  commitChips(player, target - player.currentBet);
  applyAggression(state, player, target, raiseSize);
}

/** Apply an all-in whose total exceeds the current bet (acts as a bet/raise). */
function applyAllInRaise(state: GameState, player: Player, target: number): void {
  const raiseSize = target - state.currentBet;
  commitChips(player, player.chips); // commit entire remaining stack
  applyAggression(state, player, target, raiseSize);
}

/**
 * Shared bookkeeping after a player increases the bet. A raise that meets the
 * minimum is a *full* raise: it advances `minRaise` and `reopenLevel`, reopening
 * the right to re-raise. A short all-in raises the call amount but does not.
 */
function applyAggression(
  state: GameState,
  player: Player,
  target: number,
  raiseSize: number,
): void {
  state.currentBet = target;
  state.lastAggressorId = player.id;
  player.hasActedThisRound = true;
  if (raiseSize >= state.minRaise) {
    state.minRaise = raiseSize;
    state.reopenLevel = target;
  }
}
