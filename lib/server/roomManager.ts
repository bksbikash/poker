import { randomBytes, randomUUID } from 'node:crypto';
import type { GameConfig, GameState, PlayerAction, PlayerSeed } from '@/lib/poker';
import {
  act as engineAct,
  addPlayer,
  createGame,
  getLegalActions,
  repayLoan as engineRepayLoan,
  startHand,
  IllegalActionError,
} from '@/lib/poker';
import {
  LOAN_AMOUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SHOWDOWN_PAUSE_MS,
  STARTING_CHIPS,
  TURN_SECONDS,
} from '@/lib/config';
import type { LobbyPlayer, RoomSnapshot } from '@/lib/roomTypes';

/**
 * Server-authoritative, in-memory poker rooms. All game rules run here (never
 * on the client) so a device can only ever submit a `PlayerAction` for its own
 * seat, on its own turn. State is broadcast to every connected device over SSE,
 * redacted per viewer so no one sees another player's hole cards or the deck.
 *
 * State lives on `globalThis` so it survives Next.js dev HMR module reloads.
 */

const TURN_MS = TURN_SECONDS * 1000;

interface Seat {
  token: string;
  id: string;
  name: string;
  seatIndex: number;
}

interface Room {
  id: string;
  hostId: string;
  config: GameConfig;
  seats: Seat[];
  game: GameState | null;
  started: boolean;
  turnEndsAt: number | null;
  nextHandAt: number | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  dealTimer: ReturnType<typeof setTimeout> | null;
  subscribers: Map<string, (snapshot: RoomSnapshot) => void>;
}

const globalStore = globalThis as unknown as { __pokerRooms?: Map<string, Room> };
const rooms: Map<string, Room> = (globalStore.__pokerRooms ??= new Map<string, Room>());

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function shortCode(): string {
  // 6-character, unambiguous, upper-case room code for shareable links.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  return rooms.has(code) ? shortCode() : code;
}

function requireRoom(roomId: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  return room;
}

function lobbyRoster(room: Room): LobbyPlayer[] {
  return room.seats.map((s) => ({ id: s.id, name: s.name, seatIndex: s.seatIndex }));
}

/** Redact a game for a specific viewer: hide opponents' cards and the deck. */
function redactGame(game: GameState, viewerId: string | null): GameState {
  const contenders = game.players.filter((p) => !p.folded && p.holeCards.length === 2);
  const showdownReveal = game.phase === 'showdown' && contenders.length >= 2;
  const players = game.players.map((p) => {
    const reveal = p.id === viewerId || (showdownReveal && !p.folded);
    return {
      ...p,
      holeCount: p.holeCards.length,
      holeCards: reveal ? p.holeCards : [],
    };
  });
  return { ...game, deck: [], players };
}

function snapshotFor(room: Room, token: string | null): RoomSnapshot {
  const seat = token ? room.seats.find((s) => s.token === token) : undefined;
  const viewerId = seat?.id ?? null;
  return {
    roomId: room.id,
    started: room.started,
    you: viewerId,
    isHost: viewerId === room.hostId,
    hostId: room.hostId,
    smallBlind: room.config.smallBlind,
    bigBlind: room.config.bigBlind,
    players: lobbyRoster(room),
    game: room.game ? redactGame(room.game, viewerId) : null,
    turnEndsAt: room.turnEndsAt,
    nextHandAt: room.nextHandAt,
  };
}

function broadcast(room: Room): void {
  for (const [token, send] of room.subscribers) {
    send(snapshotFor(room, token));
  }
}

function clearTimers(room: Room): void {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (room.dealTimer) {
    clearTimeout(room.dealTimer);
    room.dealTimer = null;
  }
}

/** Arrange the room's timers for the current game phase (authoritative clock). */
function schedule(room: Room): void {
  clearTimers(room);
  const game = room.game;
  if (!game) return;

  if (game.phase === 'showdown' || game.phase === 'handComplete') {
    room.turnEndsAt = null;
    room.nextHandAt = Date.now() + SHOWDOWN_PAUSE_MS;
    room.dealTimer = setTimeout(() => {
      if (!room.game) return;
      room.game = startHand(room.game);
      schedule(room);
      broadcast(room);
    }, SHOWDOWN_PAUSE_MS);
    return;
  }

  room.nextHandAt = null;
  const current = game.players[game.currentPlayerIndex];
  if (!current) {
    room.turnEndsAt = null;
    return;
  }
  room.turnEndsAt = Date.now() + TURN_MS;
  room.turnTimer = setTimeout(() => autoAct(room), TURN_MS);
}

function autoAct(room: Room): void {
  const game = room.game;
  if (!game) return;
  const current = game.players[game.currentPlayerIndex];
  if (!current) return;
  const legal = getLegalActions(game, current.id);
  try {
    room.game = engineAct(game, current.id, legal.canCheck ? { type: 'check' } : { type: 'fold' });
  } catch {
    // Should never happen — auto action is always legal — but never crash the loop.
  }
  schedule(room);
  broadcast(room);
}

/* -------------------------------------------------------------------------- */
/*  Public API (called from route handlers)                                   */
/* -------------------------------------------------------------------------- */

export interface JoinResult {
  roomId: string;
  token: string;
  playerId: string;
}

export function createRoom(input: {
  hostName: string;
  smallBlind: number;
  bigBlind: number;
}): JoinResult {
  const id = shortCode();
  const config: GameConfig = {
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    startingChips: STARTING_CHIPS,
    loanAmount: LOAN_AMOUNT,
    maxPlayers: MAX_PLAYERS,
  };
  const token = randomUUID();
  const hostSeat: Seat = {
    token,
    id: 'p0',
    name: sanitizeName(input.hostName, 0),
    seatIndex: 0,
  };
  const room: Room = {
    id,
    hostId: hostSeat.id,
    config,
    seats: [hostSeat],
    game: null,
    started: false,
    turnEndsAt: null,
    nextHandAt: null,
    turnTimer: null,
    dealTimer: null,
    subscribers: new Map(),
  };
  rooms.set(id, room);
  return { roomId: id, token, playerId: hostSeat.id };
}

export function joinRoom(roomId: string, name: string): JoinResult {
  const room = requireRoom(roomId);
  if (room.seats.length >= MAX_PLAYERS) throw new Error('Table is full');

  const seatIndex = room.seats.length;
  const seat: Seat = {
    token: randomUUID(),
    id: `p${seatIndex}`,
    name: sanitizeName(name, seatIndex),
    seatIndex,
  };
  room.seats.push(seat);

  // Joining mid-match: seat the player with a fresh stack. They sit out the
  // current hand and are dealt in automatically on the next deal.
  if (room.started && room.game) {
    room.game = addPlayer(room.game, { id: seat.id, name: seat.name });
    room.config = { ...room.config, maxPlayers: room.seats.length };
  }

  broadcast(room);
  return { roomId, token: seat.token, playerId: seat.id };
}

export function startRoom(roomId: string, token: string): void {
  const room = requireRoom(roomId);
  const seat = room.seats.find((s) => s.token === token);
  if (!seat || seat.id !== room.hostId) throw new Error('Only the host can start the game');
  if (room.started) throw new Error('Game already started');
  if (room.seats.length < MIN_PLAYERS) throw new Error('Need at least two players');

  const seeds: PlayerSeed[] = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isAI: false,
    difficulty: null,
  }));
  room.config = { ...room.config, maxPlayers: seeds.length };
  room.game = startHand(createGame(room.config, seeds));
  room.started = true;
  schedule(room);
  broadcast(room);
}

export function submitAction(roomId: string, token: string, action: PlayerAction): void {
  const room = requireRoom(roomId);
  const seat = room.seats.find((s) => s.token === token);
  if (!seat) throw new Error('You are not seated at this table');
  const game = room.game;
  if (!game) throw new Error('Game has not started');

  const current = game.players[game.currentPlayerIndex];
  if (!current || current.id !== seat.id) {
    throw new IllegalActionError('It is not your turn');
  }

  room.game = engineAct(game, seat.id, action); // throws IllegalActionError on bad input
  schedule(room);
  broadcast(room);
}

/** Repay a player's dealer loan (requires holding at least double the loan). */
export function repayLoan(roomId: string, token: string): void {
  const room = requireRoom(roomId);
  const seat = room.seats.find((s) => s.token === token);
  if (!seat) throw new Error('You are not seated at this table');
  if (!room.game) throw new Error('Game has not started');
  room.game = engineRepayLoan(room.game, seat.id); // throws if ineligible
  broadcast(room);
}

/** Subscribe an SSE client. Immediately pushes the current snapshot. */
export function subscribe(
  roomId: string,
  token: string | null,
  send: (snapshot: RoomSnapshot) => void,
): () => void {
  const room = requireRoom(roomId);
  const key = token ?? `spectator-${randomUUID()}`;
  room.subscribers.set(key, send);
  send(snapshotFor(room, token));
  return () => {
    room.subscribers.delete(key);
  };
}

export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}

function sanitizeName(name: string, seatIndex: number): string {
  const trimmed = name.trim().slice(0, 14);
  return trimmed || `Player ${seatIndex + 1}`;
}
