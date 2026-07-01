import { describe, expect, it } from 'vitest';
import { buildPots, returnUncalledBet, resolveShowdown } from '@/lib/poker';
import { cards, makePlayer } from './helpers';

describe('side pot construction', () => {
  it('creates a main pot and one side pot for a short all-in', () => {
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 100, allIn: true }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 300 }),
      makePlayer({ id: 'C', seatIndex: 2, totalBet: 300 }),
    ];
    const pots = buildPots(players);
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 300, isMain: true });
    expect(new Set(pots[0].eligiblePlayerIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(pots[1]).toMatchObject({ amount: 400, isMain: false });
    expect(new Set(pots[1].eligiblePlayerIds)).toEqual(new Set(['B', 'C']));
  });

  it('excludes folded players from eligibility but keeps their chips in the pot', () => {
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 100, allIn: true }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 200 }),
      makePlayer({ id: 'C', seatIndex: 2, totalBet: 200, folded: true }),
    ];
    const pots = buildPots(players);
    // Level 100: 3×100 = 300 (A,B eligible). Level 200: 2×100 = 200 (B eligible).
    expect(pots[0].amount).toBe(300);
    expect(new Set(pots[0].eligiblePlayerIds)).toEqual(new Set(['A', 'B']));
    expect(pots[1].amount).toBe(200);
    expect(pots[1].eligiblePlayerIds).toEqual(['B']);
  });

  it('merges equal contributions into a single pot', () => {
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 50 }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 50 }),
      makePlayer({ id: 'C', seatIndex: 2, totalBet: 50 }),
    ];
    const pots = buildPots(players);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(150);
  });
});

describe('uncalled bet return', () => {
  it('refunds the unmatched portion to the sole top contributor', () => {
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, chips: 900, totalBet: 100 }),
      makePlayer({ id: 'B', seatIndex: 1, chips: 950, totalBet: 50, folded: true }),
    ];
    const refund = returnUncalledBet(players);
    expect(refund).toEqual({ playerId: 'A', amount: 50 });
    expect(players[0].chips).toBe(950);
    expect(players[0].totalBet).toBe(50);
    // The pot is now exactly the matched amount.
    expect(buildPots(players)[0].amount).toBe(100);
  });

  it('returns null when the top bet is matched', () => {
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 100 }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 100 }),
    ];
    expect(returnUncalledBet(players)).toBeNull();
  });
});

describe('showdown awarding with side pots', () => {
  it('awards each pot to its strongest eligible player', () => {
    // Board gives everyone trips of different ranks.
    const board = cards('As', 'Ks', 'Qd', '7h', '2c');
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 100, allIn: true, holeCards: cards('Ah', 'Ad') }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 300, holeCards: cards('Kh', 'Kd') }),
      makePlayer({ id: 'C', seatIndex: 2, totalBet: 300, holeCards: cards('7s', '7d') }),
    ];
    const pots = buildPots(players);
    const awards = resolveShowdown(pots, players, board, 0);

    const main = awards.find((a) => a.isMain);
    const side = awards.find((a) => !a.isMain);
    expect(main?.winners).toHaveLength(1);
    expect(main?.winners[0]).toMatchObject({ playerId: 'A', share: 300 }); // trip aces
    expect(side?.winners[0]).toMatchObject({ playerId: 'B', share: 400 }); // trip kings
  });
});

describe('split pots and odd chips', () => {
  it('splits an even pot equally', () => {
    const board = cards('As', 'Kh', 'Qd', 'Jc', '9s');
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 100, holeCards: cards('2c', '3d') }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 100, holeCards: cards('2h', '3s') }),
    ];
    const awards = resolveShowdown(buildPots(players), players, board, 0);
    const shares = awards[0].winners.map((w) => w.share).sort();
    expect(shares).toEqual([100, 100]);
  });

  it('gives the odd chip to the player closest to the left of the button', () => {
    const board = cards('As', 'Kh', 'Qd', 'Jc', '9s');
    // A and B tie and split a 201-chip pot (C folded contributing the odd chip).
    const players = [
      makePlayer({ id: 'A', seatIndex: 0, totalBet: 67, holeCards: cards('2c', '3d') }),
      makePlayer({ id: 'B', seatIndex: 1, totalBet: 67, holeCards: cards('2h', '3s') }),
      makePlayer({ id: 'C', seatIndex: 2, totalBet: 67, folded: true, holeCards: cards('4c', '5d') }),
    ];
    const pots = buildPots(players);
    expect(pots[0].amount).toBe(201);
    // Dealer on seat 0 → seat 1 (B) is first to the left of the button → odd chip.
    const awards = resolveShowdown(pots, players, board, 0);
    const byId = new Map(awards[0].winners.map((w) => [w.playerId, w.share]));
    expect(byId.get('B')).toBe(101);
    expect(byId.get('A')).toBe(100);
  });
});
