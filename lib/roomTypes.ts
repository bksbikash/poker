import type { GameState } from './poker';

/** A joined guest as shown in the pre-game lobby roster. */
export interface LobbyPlayer {
  id: string;
  name: string;
  seatIndex: number;
}

/**
 * The per-viewer snapshot streamed to each connected client. The `game` is
 * redacted for the viewer — opponents' hole cards are removed (only counts
 * remain) and the deck is never included.
 */
export interface RoomSnapshot {
  roomId: string;
  started: boolean;
  /** The viewer's own player id (which seat this device controls). */
  you: string | null;
  isHost: boolean;
  hostId: string;
  smallBlind: number;
  bigBlind: number;
  /** Lobby roster (always present, even after the game starts). */
  players: LobbyPlayer[];
  /** Redacted game state; null before the game starts. */
  game: GameState | null;
  /** Epoch ms when the current turn auto-resolves, or null. */
  turnEndsAt: number | null;
  /** Epoch ms when the next hand will be dealt during a showdown, or null. */
  nextHandAt: number | null;
}
