import { describe, expect, it } from 'vitest';
import type { GameConfig, GameState, PlayerAction } from '@/lib/poker';
import {
  act,
  createGame,
  getLegalActions,
  startHand,
  standings,
  IllegalActionError,
  createSeededRandom,
} from '@/lib/poker';
import { makeSeeds } from './helpers';

const CONFIG: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingChips: 1000,
  loanAmount: 5000,
  maxPlayers: 3,
};

function totalChips(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.chips, 0);
}

function committedTotal(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.chips + p.totalBet, 0);
}

const isBettable = (state: GameState): boolean =>
  state.phase === 'preflop' ||
  state.phase === 'flop' ||
  state.phase === 'turn' ||
  state.phase === 'river';

describe('game setup & legal actions', () => {
  it('posts blinds and sets the first actor pre-flop', () => {
    const game = startHand(createGame(CONFIG, makeSeeds(3)), createSeededRandom(1));
    expect(game.phase).toBe('preflop');
    expect(game.currentBet).toBe(10);
    const sb = game.players.find((p) => p.smallBlind);
    const bb = game.players.find((p) => p.bigBlind);
    expect(sb?.currentBet).toBe(5);
    expect(bb?.currentBet).toBe(10);
    // Each player was dealt exactly two hole cards.
    expect(game.players.every((p) => p.holeCards.length === 2)).toBe(true);
  });

  it('forbids checking when facing the big blind', () => {
    const game = startHand(createGame(CONFIG, makeSeeds(3)), createSeededRandom(2));
    const actor = game.players[game.currentPlayerIndex];
    const legal = getLegalActions(game, actor.id);
    expect(legal.canCheck).toBe(false);
    expect(legal.canCall).toBe(true);
    expect(() => act(game, actor.id, { type: 'check' })).toThrow(IllegalActionError);
  });

  it('enforces the minimum raise', () => {
    const game = startHand(createGame(CONFIG, makeSeeds(3)), createSeededRandom(3));
    const actor = game.players[game.currentPlayerIndex];
    const legal = getLegalActions(game, actor.id);
    expect(legal.minRaiseTo).toBe(20);
    expect(() => act(game, actor.id, { type: 'raise', amount: 15 })).toThrow(IllegalActionError);
    expect(() => act(game, actor.id, { type: 'raise', amount: 20 })).not.toThrow();
  });

  it('rejects acting out of turn', () => {
    const game = startHand(createGame(CONFIG, makeSeeds(3)), createSeededRandom(4));
    const notActor = game.players[(game.currentPlayerIndex + 1) % game.players.length];
    expect(() => act(game, notActor.id, { type: 'call' })).toThrow(IllegalActionError);
  });
});

describe('hand flow & chip accounting', () => {
  it('conserves chips through a check/call hand to showdown', () => {
    let game = startHand(createGame(CONFIG, makeSeeds(3)), createSeededRandom(11));
    expect(committedTotal(game)).toBe(3000);

    let guard = 0;
    while (isBettable(game) && guard++ < 200) {
      const actor = game.players[game.currentPlayerIndex];
      const legal = getLegalActions(game, actor.id);
      const action: PlayerAction = legal.canCheck ? { type: 'check' } : { type: 'call' };
      game = act(game, actor.id, action);
      // While the hand is live, stacks + committed chips must equal the total.
      if (isBettable(game)) expect(committedTotal(game)).toBe(3000);
    }

    expect(['showdown', 'handComplete']).toContain(game.phase);
    expect(totalChips(game)).toBe(3000); // pot fully redistributed
    expect(game.communityCards).toHaveLength(5);
  });

  it('awards an uncontested pot when everyone folds (heads-up)', () => {
    const headsUp: GameConfig = { ...CONFIG, maxPlayers: 2 };
    const game = startHand(createGame(headsUp, makeSeeds(2)), createSeededRandom(5));
    const buttonSb = game.players[game.currentPlayerIndex]; // heads-up: button acts first
    const next = act(game, buttonSb.id, { type: 'fold' });

    expect(next.phase).toBe('showdown');
    const winner = next.players.find((p) => p.id !== buttonSb.id);
    const folder = next.players.find((p) => p.id === buttonSb.id);
    expect(winner?.chips).toBe(1005); // won the 10 blinds; net +5
    expect(folder?.chips).toBe(995); // lost the small blind
    expect(totalChips(next)).toBe(2000);
  });

  it('runs the board out to showdown when players are all-in', () => {
    const shortStack: GameConfig = { ...CONFIG, startingChips: 200, maxPlayers: 2 };
    let game = startHand(createGame(shortStack, makeSeeds(2)), createSeededRandom(9));

    const first = game.players[game.currentPlayerIndex];
    game = act(game, first.id, { type: 'allIn' });

    if (isBettable(game)) {
      const second = game.players[game.currentPlayerIndex];
      game = act(game, second.id, { type: 'call' });
    }

    expect(game.phase).toBe('showdown');
    expect(game.communityCards).toHaveLength(5);
    expect(totalChips(game)).toBe(400);
    // Exactly one of the two players should hold all the chips (no split here is
    // not guaranteed, so just assert conservation + a recorded award).
    expect(game.awards.length).toBeGreaterThan(0);
  });

  it('rotates the dealer button between hands', () => {
    let game = startHand(createGame(CONFIG, makeSeeds(3)), createSeededRandom(20));
    const firstButton = game.dealerIndex;
    // Fold the hand out quickly by folding non-blind actors until it ends.
    let guard = 0;
    while (isBettable(game) && guard++ < 50) {
      const actor = game.players[game.currentPlayerIndex];
      const legal = getLegalActions(game, actor.id);
      game = act(game, actor.id, legal.canCheck ? { type: 'check' } : { type: 'fold' });
    }
    game = startHand(game, createSeededRandom(21));
    expect(game.dealerIndex).not.toBe(firstButton);
  });
});

describe('loan economy & standings', () => {
  it('auto-loans a broke player instead of eliminating them', () => {
    const fresh = createGame(CONFIG, makeSeeds(3));
    fresh.players[1].chips = 0; // simulate a bust before the next hand
    const game = startHand(fresh, createSeededRandom(1));
    expect(game.players[1].loan).toBe(5000);
    expect(game.players[1].eliminated).toBe(false);
    expect(game.players[1].chips).toBeGreaterThan(0);
  });

  it('ranks the leader (highest net worth) and loser (most in debt)', () => {
    const game = createGame(CONFIG, makeSeeds(3));
    game.players[0].chips = 2000; // net 2000 → leader
    game.players[1].chips = 500;
    game.players[2].chips = 100;
    game.players[2].loan = 1000; // net -900 → loser
    const ranks = standings(game);
    expect(ranks.leaderId).toBe(game.players[0].id);
    expect(ranks.loserId).toBe(game.players[2].id);
  });
});

describe('AI safety', () => {
  it('never produces an illegal action across many random hands', async () => {
    const { decideAction } = await import('@/lib/poker');
    for (let seed = 0; seed < 40; seed++) {
      let game = startHand(createGame(CONFIG, makeSeeds(3, 0)), createSeededRandom(seed));
      let guard = 0;
      while (isBettable(game) && guard++ < 300) {
        const actor = game.players[game.currentPlayerIndex];
        const action = decideAction(game, actor.id, createSeededRandom(seed * 31 + guard));
        // Should not throw — the engine validates and the AI only picks legal moves.
        game = act(game, actor.id, action);
        if (isBettable(game)) expect(committedTotal(game)).toBe(3000);
      }
      expect(['showdown', 'handComplete']).toContain(game.phase);
      expect(totalChips(game)).toBe(3000);
    }
  });
});
