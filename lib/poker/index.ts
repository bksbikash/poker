/**
 * Public API of the poker engine. UI and store code should import from here
 * rather than reaching into individual modules.
 */

export * from './types';
export {
  SUITS,
  RANKS,
  createDeck,
  cardId,
  cardLabel,
  rankLabel,
  rankName,
  rankNamePlural,
  suitSymbol,
  isRedSuit,
  hasNoDuplicates,
} from './deck';
export { shuffle, shuffleDeck, createSeededRandom, type RandomSource } from './shuffle';
export { evaluateHand, evaluateBestHand, compareHands } from './handEvaluator';
export { buildPots, returnUncalledBet, totalCommitted } from './sidePotManager';
export { resolveShowdown, resolveUncontested } from './winnerEvaluator';
export {
  getLegalActions,
  applyBettingAction,
  amountToCall,
  minRaiseTo,
  commitChips,
  IllegalActionError,
} from './betting';
export {
  canAct,
  isInHand,
  isSeated,
  isBettingRoundComplete,
  nextToAct,
  needsToAct,
  countInHand,
  countCanAct,
} from './turnManager';
export {
  assignButtonAndBlinds,
  dealHoleCards,
  dealFlop,
  dealTurn,
  dealRiver,
  rotateButton,
  countSeated,
  firstToActPostFlop,
} from './dealer';
export {
  createGame,
  startHand,
  act,
  addPlayer,
  forceFold,
  leaveTable,
  rejoinTable,
  repayLoan,
  canRepayLoan,
  currentPlayer,
  displayPot,
  isGameOver,
  netWorth,
  standings,
} from './gameEngine';
export { decideAction, preflopStrength, madeHandStrength } from './aiEngine';
