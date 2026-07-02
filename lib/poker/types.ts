/**
 * Core domain types for the Texas Hold'em engine.
 *
 * Every type here is intentionally explicit. The codebase forbids the `any`
 * type entirely — `unknown` + narrowing is used where a dynamic value is
 * unavoidable.
 */

/* -------------------------------------------------------------------------- */
/*  Cards                                                                     */
/* -------------------------------------------------------------------------- */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/**
 * Numeric rank. Aces are encoded as 14 (high). The evaluator handles the
 * special A-2-3-4-5 "wheel" straight where the ace plays low.
 */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/** Immutable, fully-dealt deck/board is always an array of `Card`. */
export type Deck = Card[];

/* -------------------------------------------------------------------------- */
/*  Hand evaluation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Hand strength categories. Values are ordered so that a higher numeric value
 * is always a stronger hand — comparison is therefore trivial. A Royal Flush is
 * modelled as a distinct top category even though it is mechanically the best
 * possible Straight Flush.
 */
export enum HandRank {
  HighCard = 1,
  OnePair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
  RoyalFlush = 10,
}

export interface HandResult {
  /** Strength category — higher is stronger. */
  readonly rank: HandRank;
  /** Human readable category name, e.g. "Full House". */
  readonly name: string;
  /** Fully descriptive label, e.g. "Full House, Kings full of Tens". */
  readonly description: string;
  /** The exact best five cards making up the hand. */
  readonly cards: Card[];
  /**
   * Ordered tie-break values, most significant first. Two hands of the same
   * `rank` are compared by lexicographically comparing these arrays.
   */
  readonly tiebreakers: number[];
}

/* -------------------------------------------------------------------------- */
/*  Players                                                                   */
/* -------------------------------------------------------------------------- */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Player {
  readonly id: string;
  name: string;
  /** Seat position around the table, 0-indexed. Stable for the game's life. */
  readonly seatIndex: number;
  chips: number;
  /**
   * Total chips borrowed from the dealer across the game. Instead of being
   * eliminated, a player who runs out is auto-loaned more. Net worth used for
   * standings is `chips - loan`.
   */
  loan: number;
  holeCards: Card[];
  /**
   * Number of hole cards the player holds. Equals `holeCards.length` locally;
   * in a networked view where opponents' cards are hidden, `holeCards` is
   * emptied but `holeCount` still reports how many face-down cards to render.
   */
  holeCount?: number;
  /** Chips committed in the current betting round only. */
  currentBet: number;
  /** Chips committed across the whole hand (all rounds). */
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  /** Has the dealer button this hand. */
  dealer: boolean;
  smallBlind: boolean;
  bigBlind: boolean;
  /** Dealt into and still part of the current hand (not folded/eliminated). */
  active: boolean;
  /** Out of the game entirely — no chips remaining. (Unused: loans replace elimination.) */
  eliminated: boolean;
  /**
   * Temporarily out — left the table or disconnected. Kept seated (chips
   * preserved) but skipped for dealing/positions until they return.
   */
  sittingOut: boolean;
  /** Whether this player has acted at least once in the current betting round. */
  hasActedThisRound: boolean;
  readonly isAI: boolean;
  readonly difficulty: Difficulty | null;
}

/* -------------------------------------------------------------------------- */
/*  Betting & pots                                                            */
/* -------------------------------------------------------------------------- */

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn';

export interface PlayerAction {
  readonly type: ActionType;
  /**
   * For `bet` and `raise` this is the *total* amount the player's
   * `currentBet` should become this round (raise-to semantics), which removes
   * all ambiguity. Ignored for other action types.
   */
  readonly amount?: number;
}

export interface Pot {
  amount: number;
  /** Players still eligible to win this pot (contributed and not folded). */
  eligiblePlayerIds: string[];
  /** The first (base) pot is the main pot; subsequent are side pots. */
  isMain: boolean;
}

/** What the current player is legally allowed to do right now. */
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Amount required to call (chips, capped at the player's stack). */
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Minimum legal total bet/raise (raise-to). */
  minRaiseTo: number;
  /** Maximum legal total bet/raise (raise-to) — the player's all-in amount. */
  maxRaiseTo: number;
  canAllIn: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Showdown results                                                          */
/* -------------------------------------------------------------------------- */

export interface PotAward {
  /** Index into `GameState.pots`. */
  readonly potIndex: number;
  readonly amount: number;
  readonly isMain: boolean;
  readonly winners: PotWinner[];
}

export interface PotWinner {
  readonly playerId: string;
  /** Chips awarded to this player from this pot. */
  readonly share: number;
  /** Best hand at showdown, or null when the pot was won by a fold. */
  readonly hand: HandResult | null;
}

/* -------------------------------------------------------------------------- */
/*  Game phase & state                                                        */
/* -------------------------------------------------------------------------- */

export type GamePhase =
  | 'waiting' // no hand in progress
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown' // hands revealed, pots being awarded
  | 'handComplete'; // hand finished, ready to deal the next

export interface GameConfig {
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  /** Chips auto-loaned by the dealer when a player runs out (no elimination). */
  loanAmount: number;
  /** 2–10. */
  maxPlayers: number;
}

export interface ActionLogEntry {
  readonly handNumber: number;
  readonly phase: GamePhase;
  readonly playerId: string;
  readonly playerName: string;
  readonly action: ActionType;
  readonly amount: number;
  readonly message: string;
}

export interface GameState {
  players: Player[];
  /** Remaining undealt cards. */
  deck: Deck;
  communityCards: Card[];
  pots: Pot[];
  phase: GamePhase;
  /** Seat index of the dealer button. */
  dealerIndex: number;
  /** Seat index of the player whose turn it is, or -1 when no one acts. */
  currentPlayerIndex: number;
  /** Highest committed `currentBet` this round (the amount to match). */
  currentBet: number;
  /** Minimum legal raise increment (the size of the last full raise). */
  minRaise: number;
  /**
   * Bet level set by the last *full* bet/raise. Used to enforce the rule that
   * an all-in for less than a full raise does not reopen the right to re-raise
   * for players who have already acted.
   */
  reopenLevel: number;
  /** Id of the last player to bet/raise this round, used to close the round. */
  lastAggressorId: string | null;
  smallBlindAmount: number;
  bigBlindAmount: number;
  handNumber: number;
  /** Populated during `showdown` / `handComplete`. */
  awards: PotAward[];
  /** Ordered, capped log of actions for the UI feed. */
  log: ActionLogEntry[];
  readonly config: GameConfig;
}

/** Definition used to seed a player when the game is created. */
export interface PlayerSeed {
  readonly id: string;
  readonly name: string;
  readonly isAI: boolean;
  readonly difficulty: Difficulty | null;
}
