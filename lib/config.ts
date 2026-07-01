/**
 * Shared game configuration constants used by both the server (room manager)
 * and the client (UI). Kept free of any server- or client-only imports.
 */

/** Coin economy: 5×100 + 5×500 + 5×1000 = 8000 to start. */
export const STARTING_CHIPS = 8000;

/** Auto-loan from the dealer when a player runs out (no elimination). */
export const LOAN_AMOUNT = 5000;

/** Seconds each player has to act before an auto check/fold. */
export const TURN_SECONDS = 30;

/** Pause after a hand resolves before the next is dealt automatically (ms). */
export const SHOWDOWN_PAUSE_MS = 4500;

/** Coin-friendly blind presets (all multiples of 100). */
export const BLIND_OPTIONS: readonly { sb: number; bb: number }[] = [
  { sb: 100, bb: 200 },
  { sb: 200, bb: 400 },
  { sb: 500, bb: 1000 },
];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
