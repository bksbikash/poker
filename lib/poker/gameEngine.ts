import type {
  ActionLogEntry,
  GameConfig,
  GameState,
  LegalActions,
  Player,
  PlayerAction,
  PlayerSeed,
  PotAward,
} from './types';
import { createDeck } from './deck';
import { shuffleDeck, type RandomSource } from './shuffle';
import {
  applyBettingAction,
  getLegalActions as computeLegalActions,
  IllegalActionError,
} from './betting';
import {
  assignButtonAndBlinds,
  dealFlop,
  dealHoleCards,
  dealRiver,
  dealTurn,
  firstToActPostFlop,
  rotateButton,
} from './dealer';
import {
  buildPots,
  returnUncalledBet,
  totalCommitted,
} from './sidePotManager';
import { resolveShowdown, resolveUncontested } from './winnerEvaluator';
import {
  canAct,
  countCanAct,
  firstSeatIndexFrom,
  isInHand,
  isSeated,
  isBettingRoundComplete,
  needsToAct,
} from './turnManager';

/**
 * The game engine orchestrates a full Texas Hold'em hand as a pure state
 * machine. Every public function takes a {@link GameState} and returns a new
 * one — the input is never mutated, so the store/UI can rely on referential
 * change detection and time-travel is trivial.
 */

const MAX_LOG_ENTRIES = 60;

/* -------------------------------------------------------------------------- */
/*  Construction                                                              */
/* -------------------------------------------------------------------------- */

export function createGame(config: GameConfig, seeds: readonly PlayerSeed[]): GameState {
  if (seeds.length < 2 || seeds.length > 10) {
    throw new Error('Texas Hold\'em supports 2–10 players');
  }
  if (config.maxPlayers < 2 || config.maxPlayers > 10) {
    throw new Error('maxPlayers must be between 2 and 10');
  }

  const players: Player[] = seeds.map((seed, index) => ({
    id: seed.id,
    name: seed.name,
    seatIndex: index,
    chips: config.startingChips,
    loan: 0,
    holeCards: [],
    currentBet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    dealer: false,
    smallBlind: false,
    bigBlind: false,
    active: false,
    eliminated: false,
    sittingOut: false,
    hasActedThisRound: false,
    isAI: seed.isAI,
    difficulty: seed.difficulty,
  }));

  return {
    players,
    deck: [],
    communityCards: [],
    pots: [],
    phase: 'waiting',
    dealerIndex: 0,
    currentPlayerIndex: -1,
    currentBet: 0,
    minRaise: config.bigBlind,
    reopenLevel: 0,
    lastAggressorId: null,
    smallBlindAmount: config.smallBlind,
    bigBlindAmount: config.bigBlind,
    handNumber: 0,
    awards: [],
    log: [],
    config,
  };
}

/* -------------------------------------------------------------------------- */
/*  Hand lifecycle                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Begin a new hand: eliminate the busted, rotate the button, shuffle, post
 * blinds and deal. If fewer than two players remain the game is over and the
 * returned state has phase `handComplete`.
 */
export function startHand(state: GameState, rng: RandomSource = Math.random): GameState {
  const next = cloneState(state);

  // No elimination: a player who has run out of chips is auto-loaned more by
  // the dealer so they can keep playing. The loan is tracked against them and
  // reduces their net worth (used for standings). Players sitting out are not
  // loaned or dealt in.
  for (const player of next.players) {
    if (isSeated(player) && player.chips <= 0) {
      player.chips += next.config.loanAmount;
      player.loan += next.config.loanAmount;
    }
  }

  if (next.players.filter(isSeated).length < 2) {
    // Not enough active players to deal — wait for someone to join / return.
    next.phase = 'handComplete';
    next.currentPlayerIndex = -1;
    for (const player of next.players) {
      player.holeCards = [];
      player.currentBet = 0;
      player.totalBet = 0;
    }
    return next;
  }

  next.handNumber += 1;
  next.deck = shuffleDeck(createDeck(), rng);
  next.communityCards = [];
  next.pots = [];
  next.awards = [];

  for (const player of next.players) {
    player.holeCards = [];
    player.currentBet = 0;
    player.totalBet = 0;
    player.allIn = false;
    player.dealer = false;
    player.smallBlind = false;
    player.bigBlind = false;
    player.hasActedThisRound = false;
    const seated = isSeated(player);
    player.active = seated;
    player.folded = !seated; // sitting-out / eliminated players are out of the hand
  }

  // Select / rotate the dealer button onto a seated player.
  next.dealerIndex =
    next.handNumber === 1
      ? firstSeatIndexFrom(next.players, next.dealerIndex, isSeated)
      : rotateButton(next.players, next.dealerIndex);

  next.phase = 'preflop';
  assignButtonAndBlinds(next);
  dealHoleCards(next);

  log(next, {
    handNumber: next.handNumber,
    phase: 'preflop',
    playerId: 'system',
    playerName: 'Dealer',
    action: 'check',
    amount: 0,
    message: `Hand #${next.handNumber} dealt — blinds ${next.smallBlindAmount}/${next.bigBlindAmount}`,
  });

  return settle(next);
}

/**
 * Apply a player's action and advance the game. Throws
 * {@link IllegalActionError} for any illegal action.
 */
export function act(state: GameState, playerId: string, action: PlayerAction): GameState {
  if (!isBettablePhase(state.phase)) {
    throw new IllegalActionError('No betting round is in progress');
  }
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new IllegalActionError(`Unknown player: ${playerId}`);

  const before = { currentBet: player.currentBet, chips: player.chips };
  applyBettingAction(next, playerId, action);
  log(next, describeAction(next, player, action, before));

  return settle(next);
}

/** Legal actions for the player whose turn it currently is. */
export function getLegalActions(state: GameState, playerId: string): LegalActions {
  return computeLegalActions(state, playerId);
}

/**
 * Seat a new player at the table mid-game. They join with the standard starting
 * stack but sit out the hand in progress (folded, inactive) and are dealt in
 * automatically on the next {@link startHand}. Appended at the end so existing
 * seat indices — and therefore the current hand — are untouched.
 */
export function addPlayer(
  state: GameState,
  player: { id: string; name: string },
): GameState {
  const next = cloneState(state);
  const seatIndex = next.players.length;
  next.players.push({
    id: player.id,
    name: player.name,
    seatIndex,
    chips: next.config.startingChips,
    loan: 0,
    holeCards: [],
    currentBet: 0,
    totalBet: 0,
    folded: true, // sitting out the hand in progress
    allIn: false,
    dealer: false,
    smallBlind: false,
    bigBlind: false,
    active: false,
    eliminated: false,
    sittingOut: false,
    hasActedThisRound: false,
    isAI: false,
    difficulty: null,
  });
  return next;
}

/**
 * Fold a specific player out of the current hand regardless of whose turn it
 * is — used when a player leaves or disconnects. Re-settles the hand (which may
 * award an uncontested pot or advance the action).
 */
export function forceFold(state: GameState, playerId: string): GameState {
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return next;
  if (!isBettablePhase(next.phase) || player.folded || !player.active) {
    return next; // not in a live hand
  }
  player.folded = true;
  player.active = false;
  player.hasActedThisRound = true;
  return settle(next);
}

/** A player leaves / disconnects: fold them now and sit them out of future hands. */
export function leaveTable(state: GameState, playerId: string): GameState {
  const next = forceFold(state, playerId);
  const player = next.players.find((p) => p.id === playerId);
  if (player) {
    player.sittingOut = true;
    player.active = false;
    player.folded = true;
  }
  return next;
}

/** A player returns: clear the sitting-out flag so they are dealt in next hand. */
export function rejoinTable(state: GameState, playerId: string): GameState {
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (player) player.sittingOut = false;
  return next;
}

/** Whether a player may repay their loan (must hold at least double it). */
export function canRepayLoan(player: Player): boolean {
  return player.loan > 0 && player.chips >= player.loan * 2;
}

/**
 * Repay a player's dealer loan in full. Requires holding at least double the
 * loan; the loan amount leaves the stack and the debt is cleared. Net worth is
 * unchanged — it simply removes the debt (and the risk of the loser badge).
 */
export function repayLoan(state: GameState, playerId: string): GameState {
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  if (!canRepayLoan(player)) {
    throw new Error('You need at least double your loan in chips to repay it');
  }
  player.chips -= player.loan;
  player.loan = 0;
  return next;
}

/** The player whose turn it is, or null when no one is to act. */
export function currentPlayer(state: GameState): Player | null {
  if (state.currentPlayerIndex < 0) return null;
  return state.players[state.currentPlayerIndex] ?? null;
}

/** Running pot total for display while a hand is in progress. */
export function displayPot(state: GameState): number {
  if (state.pots.length > 0) return state.pots.reduce((sum, pot) => sum + pot.amount, 0);
  return totalCommitted(state.players);
}

/** Has the game ended (one or zero players with chips remain)? */
export function isGameOver(state: GameState): boolean {
  return state.players.filter((p) => !p.eliminated).length < 2;
}

/* -------------------------------------------------------------------------- */
/*  Internal state-machine driver                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bring the state to its next stable point: waiting on a player, or a resolved
 * hand. Handles fold-outs, completed betting rounds, and street advancement.
 */
function settle(state: GameState): GameState {
  const live = state.players.filter(isInHand);
  if (live.length <= 1) {
    return live.length === 1 ? endHandUncontested(state, live[0].id) : finishGame(state);
  }

  if (isBettingRoundComplete(state)) {
    return advanceStreet(state);
  }

  const startFrom = state.currentPlayerIndex < 0 ? state.dealerIndex : state.currentPlayerIndex;
  state.currentPlayerIndex = firstSeatIndexFrom(state.players, startFrom, (p) =>
    needsToAct(p, state.currentBet),
  );
  return state;
}

/**
 * Deal the next street (or reach showdown). When no further betting is possible
 * — at most one player can act — remaining streets are dealt straight through
 * to showdown.
 */
function advanceStreet(state: GameState): GameState {
  for (;;) {
    switch (state.phase) {
      case 'preflop':
        dealFlop(state);
        state.phase = 'flop';
        logStreet(state, 'Flop');
        break;
      case 'flop':
        dealTurn(state);
        state.phase = 'turn';
        logStreet(state, 'Turn');
        break;
      case 'turn':
        dealRiver(state);
        state.phase = 'river';
        logStreet(state, 'River');
        break;
      case 'river':
        return resolveAtShowdown(state);
      default:
        return state;
    }

    resetBettingRound(state);

    if (countCanAct(state.players) >= 2) {
      state.currentPlayerIndex = firstToActPostFlop(state);
      return state;
    }
    // Otherwise loop and deal the next street (all-in run-out).
  }
}

/** Reset per-round betting fields at the start of a new street. */
function resetBettingRound(state: GameState): void {
  state.currentBet = 0;
  state.minRaise = state.bigBlindAmount;
  state.reopenLevel = 0;
  state.lastAggressorId = null;
  state.currentPlayerIndex = -1;
  for (const player of state.players) {
    player.currentBet = 0;
    player.hasActedThisRound = false;
  }
}

/** Resolve a true showdown (two or more players reached the river). */
function resolveAtShowdown(state: GameState): GameState {
  refundUncalled(state);
  state.pots = buildPots(state.players);
  state.awards = resolveShowdown(
    state.pots,
    state.players,
    state.communityCards,
    state.dealerIndex,
  );
  creditAwards(state);
  state.phase = 'showdown';
  state.currentPlayerIndex = -1;
  logAwards(state);
  return state;
}

/** Resolve a pot won because everyone else folded. */
function endHandUncontested(state: GameState, winnerId: string): GameState {
  refundUncalled(state);
  state.pots = buildPots(state.players);
  state.awards = resolveUncontested(state.pots, winnerId);
  creditAwards(state);
  state.phase = 'showdown';
  state.currentPlayerIndex = -1;

  const winner = state.players.find((p) => p.id === winnerId);
  if (winner) {
    log(state, {
      handNumber: state.handNumber,
      phase: state.phase,
      playerId: winner.id,
      playerName: winner.name,
      action: 'check',
      amount: displayPot(state),
      message: `${winner.name} wins ${displayPot(state)} (all others folded)`,
    });
  }
  return state;
}

/** Degenerate terminal state — no players left in the hand. */
function finishGame(state: GameState): GameState {
  state.phase = 'handComplete';
  state.currentPlayerIndex = -1;
  return state;
}

/* -------------------------------------------------------------------------- */
/*  Chip flow helpers                                                         */
/* -------------------------------------------------------------------------- */

function refundUncalled(state: GameState): void {
  const refund = returnUncalledBet(state.players);
  if (refund && refund.amount > 0) {
    const player = state.players.find((p) => p.id === refund.playerId);
    if (player) {
      log(state, {
        handNumber: state.handNumber,
        phase: state.phase,
        playerId: player.id,
        playerName: player.name,
        action: 'check',
        amount: refund.amount,
        message: `${refund.amount} uncalled chips returned to ${player.name}`,
      });
    }
  }
}

function creditAwards(state: GameState): void {
  for (const award of state.awards) {
    for (const winner of award.winners) {
      const player = state.players.find((p) => p.id === winner.playerId);
      if (player) player.chips += winner.share;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Standings                                                                 */
/* -------------------------------------------------------------------------- */

/** A player's net worth for standings: chips on the table minus debt. */
export function netWorth(player: Player): number {
  return player.chips - player.loan;
}

/**
 * Ids of the standings leader (highest net worth → crown) and the player most
 * in the red (lowest net worth → loser badge). Either is null if it cannot be
 * determined uniquely is *not* required — ties resolve to the earliest seat.
 */
export function standings(state: GameState): { leaderId: string | null; loserId: string | null } {
  if (state.players.length === 0) return { leaderId: null, loserId: null };
  let leader = state.players[0];
  let loser = state.players[0];
  for (const player of state.players) {
    if (netWorth(player) > netWorth(leader)) leader = player;
    if (netWorth(player) < netWorth(loser)) loser = player;
  }
  // If everyone is dead level, show no badges.
  if (netWorth(leader) === netWorth(loser)) return { leaderId: null, loserId: null };
  return { leaderId: leader.id, loserId: loser.id };
}

/* -------------------------------------------------------------------------- */
/*  Logging                                                                   */
/* -------------------------------------------------------------------------- */

function isBettablePhase(phase: GameState['phase']): boolean {
  return phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river';
}

function log(state: GameState, entry: ActionLogEntry): void {
  state.log = [...state.log, entry].slice(-MAX_LOG_ENTRIES);
}

function logStreet(state: GameState, name: string): void {
  log(state, {
    handNumber: state.handNumber,
    phase: state.phase,
    playerId: 'system',
    playerName: 'Dealer',
    action: 'check',
    amount: 0,
    message: `${name} dealt`,
  });
}

function logAwards(state: GameState): void {
  for (const award of state.awards) {
    for (const winner of award.winners) {
      const player = state.players.find((p) => p.id === winner.playerId);
      if (!player) continue;
      const label = award.isMain ? 'main pot' : 'side pot';
      const handText = winner.hand ? ` with ${winner.hand.description}` : '';
      log(state, {
        handNumber: state.handNumber,
        phase: 'showdown',
        playerId: player.id,
        playerName: player.name,
        action: 'check',
        amount: winner.share,
        message: `${player.name} wins ${winner.share} (${label})${handText}`,
      });
    }
  }
}

function describeAction(
  state: GameState,
  player: Player,
  action: PlayerAction,
  before: { currentBet: number; chips: number },
): ActionLogEntry {
  const committed = player.currentBet - before.currentBet;
  let message: string;
  let amount = 0;
  switch (action.type) {
    case 'fold':
      message = `${player.name} folds`;
      break;
    case 'check':
      message = `${player.name} checks`;
      break;
    case 'call':
      amount = committed;
      message = `${player.name} calls ${committed}`;
      break;
    case 'bet':
      amount = player.currentBet;
      message = `${player.name} bets ${player.currentBet}`;
      break;
    case 'raise':
      amount = player.currentBet;
      message = `${player.name} raises to ${player.currentBet}`;
      break;
    case 'allIn':
      amount = player.currentBet;
      message = `${player.name} is all-in for ${player.currentBet}`;
      break;
    default:
      message = `${player.name} acts`;
  }
  return {
    handNumber: state.handNumber,
    phase: state.phase,
    playerId: player.id,
    playerName: player.name,
    action: action.type,
    amount,
    message,
  };
}

/* -------------------------------------------------------------------------- */
/*  Cloning                                                                   */
/* -------------------------------------------------------------------------- */

/** Deep clone game state. State holds only plain data, so structuredClone is safe. */
function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export { IllegalActionError };
export type { PotAward };
