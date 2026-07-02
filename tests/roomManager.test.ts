import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  submitAction,
  subscribe,
} from '@/lib/server/roomManager';
import { SHOWDOWN_PAUSE_MS } from '@/lib/config';
import type { RoomSnapshot } from '@/lib/roomTypes';

/**
 * Server-authoritative room manager: rostering, redaction (opponents' cards and
 * the deck must never leak), the 30-second turn clock and automatic dealing.
 */

interface Handle {
  roomId: string;
  tokens: Record<string, string>; // playerId -> token
  hostToken: string;
}

function setupRoom(names = ['Alice', 'Bob', 'Cara']): Handle {
  const host = createRoom({ hostName: names[0], smallBlind: 100, bigBlind: 200 });
  const tokens: Record<string, string> = { [host.playerId]: host.token };
  for (const name of names.slice(1)) {
    const j = joinRoom(host.roomId, name);
    tokens[j.playerId] = j.token;
  }
  return { roomId: host.roomId, tokens, hostToken: host.token };
}

/** Capture the latest snapshot pushed to a subscriber. */
function watch(roomId: string, token: string) {
  let latest: RoomSnapshot | null = null;
  const unsub = subscribe(roomId, token, (snap) => {
    latest = snap;
  });
  return {
    get: (): RoomSnapshot => {
      if (!latest) throw new Error('no snapshot');
      return latest;
    },
    unsub,
  };
}

describe('room manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('rosters players and broadcasts joins', () => {
    const host = createRoom({ hostName: 'Alice', smallBlind: 100, bigBlind: 200 });
    const view = watch(host.roomId, host.token);
    expect(view.get().players).toHaveLength(1);
    expect(view.get().isHost).toBe(true);
    joinRoom(host.roomId, 'Bob');
    expect(view.get().players).toHaveLength(2);
    view.unsub();
  });

  it('only the host can start, and needs at least two players', () => {
    const host = createRoom({ hostName: 'Solo', smallBlind: 100, bigBlind: 200 });
    expect(() => startRoom(host.roomId, host.token)).toThrow(/two players/i);
    const guest = joinRoom(host.roomId, 'Bob');
    expect(() => startRoom(host.roomId, guest.token)).toThrow(/host/i);
    expect(() => startRoom(host.roomId, host.token)).not.toThrow();
  });

  it('redacts opponents\' hole cards and never leaks the deck', () => {
    const { roomId, hostToken } = setupRoom();
    startRoom(roomId, hostToken);
    const view = watch(roomId, hostToken);
    const snap = view.get();
    expect(snap.game).not.toBeNull();
    const game = snap.game!;

    const me = game.players.find((p) => p.id === snap.you)!;
    expect(me.holeCards).toHaveLength(2); // I can see my own cards

    for (const other of game.players.filter((p) => p.id !== snap.you)) {
      expect(other.holeCards).toHaveLength(0); // hidden
      expect(other.holeCount).toBe(2); // but I know they hold two
    }
    expect(game.deck).toHaveLength(0); // the deck is never sent
    view.unsub();
  });

  it('rejects actions out of turn and from the wrong seat', () => {
    const { roomId, tokens, hostToken } = setupRoom();
    startRoom(roomId, hostToken);
    const view = watch(roomId, hostToken);
    const game = view.get().game!;
    const currentId = game.players[game.currentPlayerIndex].id;
    const otherId = Object.keys(tokens).find((id) => id !== currentId)!;
    expect(() => submitAction(roomId, tokens[otherId], { type: 'call' })).toThrow(/your turn/i);
    view.unsub();
  });

  it('auto-folds the current player when the 30-second clock expires', () => {
    const { roomId, hostToken } = setupRoom();
    startRoom(roomId, hostToken);
    const view = watch(roomId, hostToken);
    const currentId = view.get().game!.players[view.get().game!.currentPlayerIndex].id;
    vi.advanceTimersByTime(30_000);
    const player = view.get().game!.players.find((p) => p.id === currentId)!;
    expect(player.folded).toBe(true);
    view.unsub();
  });

  it('auto-deals the next hand after the showdown pause and conserves chips', () => {
    const { roomId, tokens, hostToken } = setupRoom();
    startRoom(roomId, hostToken);
    const view = watch(roomId, hostToken);

    // Fold everyone out to end the hand.
    let guard = 0;
    while (guard++ < 50) {
      const game = view.get().game!;
      if (game.phase === 'showdown' || game.phase === 'handComplete') break;
      const currentId = game.players[game.currentPlayerIndex].id;
      submitAction(roomId, tokens[currentId], { type: 'fold' });
    }

    const game = view.get().game!;
    expect(game.phase).toBe('showdown');
    expect(game.players.reduce((s, p) => s + p.chips, 0)).toBe(8000 * 3);

    const handBefore = game.handNumber;
    vi.advanceTimersByTime(SHOWDOWN_PAUSE_MS + 500);
    expect(view.get().game!.handNumber).toBe(handBefore + 1);
    view.unsub();
  });

  it('lets a guest join mid-match and deals them in on the next hand', () => {
    const { roomId, tokens, hostToken } = setupRoom();
    startRoom(roomId, hostToken);

    const late = joinRoom(roomId, 'Zoe');
    const view = watch(roomId, late.token);

    // Sitting out the hand in progress.
    const sitting = view.get().game!.players.find((p) => p.id === late.playerId)!;
    expect(sitting.folded).toBe(true);
    expect(sitting.chips).toBe(8000);
    expect(view.get().players).toHaveLength(4);

    // Play the current hand out (the latecomer never acts — they're folded).
    let guard = 0;
    while (guard++ < 50) {
      const game = view.get().game!;
      if (game.phase === 'showdown' || game.phase === 'handComplete') break;
      const currentId = game.players[game.currentPlayerIndex].id;
      submitAction(roomId, tokens[currentId], { type: 'fold' });
    }

    // Next hand deals the latecomer in.
    vi.advanceTimersByTime(SHOWDOWN_PAUSE_MS + 500);
    const dealtIn = view.get().game!.players.find((p) => p.id === late.playerId)!;
    expect(dealtIn.folded).toBe(false);
    expect(dealtIn.holeCards).toHaveLength(2); // visible in their own view
    view.unsub();
  });

  it('folds and sits out a player who leaves the table', () => {
    const { roomId, tokens, hostToken } = setupRoom();
    startRoom(roomId, hostToken);
    const view = watch(roomId, hostToken);

    leaveRoom(roomId, tokens.p1);
    const p1 = view.get().game!.players.find((p) => p.id === 'p1')!;
    expect(p1.folded).toBe(true);
    expect(p1.sittingOut).toBe(true);

    // On the next hand the leaver is not dealt in.
    let guard = 0;
    while (guard++ < 50) {
      const g = view.get().game!;
      if (g.phase === 'showdown' || g.phase === 'handComplete') break;
      const currentId = g.players[g.currentPlayerIndex].id;
      submitAction(roomId, tokens[currentId], { type: 'fold' });
    }
    vi.advanceTimersByTime(SHOWDOWN_PAUSE_MS + 500);
    const after = view.get().game!.players.find((p) => p.id === 'p1')!;
    expect(after.holeCount ?? 0).toBe(0);
    view.unsub();
  });
});
