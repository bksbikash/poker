import { describe, expect, it } from 'vitest';
import { evaluateHand, evaluateBestHand, compareHands, HandRank } from '@/lib/poker';
import { cards } from './helpers';

describe('hand evaluator — category detection', () => {
  it('detects a royal flush', () => {
    const h = evaluateHand(cards('As', 'Ks', 'Qs', 'Js', '10s', '2d', '3c'));
    expect(h.rank).toBe(HandRank.RoyalFlush);
  });

  it('detects a straight flush (not royal)', () => {
    const h = evaluateHand(cards('9h', '8h', '7h', '6h', '5h', 'Ah', 'Kd'));
    expect(h.rank).toBe(HandRank.StraightFlush);
    expect(h.tiebreakers[0]).toBe(9);
  });

  it('detects the wheel straight flush (5-high, ace low)', () => {
    const h = evaluateHand(cards('Ah', '2h', '3h', '4h', '5h', 'Kd', 'Qc'));
    expect(h.rank).toBe(HandRank.StraightFlush);
    expect(h.tiebreakers[0]).toBe(5);
  });

  it('detects four of a kind with correct kicker', () => {
    const h = evaluateHand(cards('7s', '7h', '7d', '7c', 'Kd', '2c', '3s'));
    expect(h.rank).toBe(HandRank.FourOfAKind);
    expect(h.tiebreakers).toEqual([7, 13]);
  });

  it('detects a full house and picks the best trips + pair', () => {
    const h = evaluateHand(cards('Ks', 'Kh', 'Kd', '9c', '9s', '2d', '2c'));
    expect(h.rank).toBe(HandRank.FullHouse);
    expect(h.tiebreakers).toEqual([13, 9]);
  });

  it('treats two sets of trips as a full house (higher trips over lower)', () => {
    const h = evaluateHand(cards('9s', '9h', '9d', '5c', '5s', '5d', '2c'));
    expect(h.rank).toBe(HandRank.FullHouse);
    expect(h.tiebreakers).toEqual([9, 5]);
  });

  it('detects a flush by the five highest of the suit', () => {
    const h = evaluateHand(cards('Ah', '10h', '7h', '4h', '2h', 'Kd', 'Qc'));
    expect(h.rank).toBe(HandRank.Flush);
    expect(h.tiebreakers).toEqual([14, 10, 7, 4, 2]);
  });

  it('detects an ace-high straight (Broadway)', () => {
    const h = evaluateHand(cards('Ah', 'Ks', 'Qd', 'Jc', '10h', '3s', '2c'));
    expect(h.rank).toBe(HandRank.Straight);
    expect(h.tiebreakers[0]).toBe(14);
  });

  it('detects the ace-low wheel straight (5-high)', () => {
    const h = evaluateHand(cards('Ah', '2s', '3d', '4c', '5h', 'Ks', 'Qc'));
    expect(h.rank).toBe(HandRank.Straight);
    expect(h.tiebreakers[0]).toBe(5);
  });

  it('detects three of a kind with two kickers', () => {
    const h = evaluateHand(cards('8s', '8h', '8d', 'Kc', '4s', '2d', '3c'));
    expect(h.rank).toBe(HandRank.ThreeOfAKind);
    expect(h.tiebreakers).toEqual([8, 13, 4]);
  });

  it('detects two pair with the correct fifth-card kicker', () => {
    const h = evaluateHand(cards('Js', 'Jh', '4d', '4c', 'As', '2d', '3c'));
    expect(h.rank).toBe(HandRank.TwoPair);
    expect(h.tiebreakers).toEqual([11, 4, 14]);
  });

  it('detects one pair with three kickers', () => {
    const h = evaluateHand(cards('Qs', 'Qh', 'Ad', '9c', '4s', '2d', '3c'));
    expect(h.rank).toBe(HandRank.OnePair);
    expect(h.tiebreakers).toEqual([12, 14, 9, 4]);
  });

  it('detects high card', () => {
    const h = evaluateHand(cards('As', 'Qh', '9d', '6c', '4s', '2d', '3c'));
    expect(h.rank).toBe(HandRank.HighCard);
    expect(h.tiebreakers).toEqual([14, 12, 9, 6, 4]);
  });
});

describe('hand evaluator — comparisons & tie breakers', () => {
  it('ranks categories correctly (flush beats straight)', () => {
    const flush = evaluateHand(cards('Ah', '10h', '7h', '4h', '2h'));
    const straight = evaluateHand(cards('9c', '8d', '7s', '6h', '5c'));
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  it('breaks a flush tie by the highest differing card', () => {
    const a = evaluateHand(cards('Ah', 'Kh', '7h', '4h', '2h'));
    const b = evaluateHand(cards('Ah', 'Qh', '7h', '4h', '3h'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('a six-high straight beats the wheel', () => {
    const six = evaluateHand(cards('6c', '5d', '4s', '3h', '2c'));
    const wheel = evaluateHand(cards('Ah', '2s', '3d', '4c', '5h'));
    expect(compareHands(six, wheel)).toBeGreaterThan(0);
  });

  it('decides a one-pair battle by kickers', () => {
    const a = evaluateHand(cards('Ks', 'Kh', 'Ad', '9c', '4s'));
    const b = evaluateHand(cards('Ks', 'Kc', 'Qd', '9h', '4d'));
    expect(compareHands(a, b)).toBeGreaterThan(0); // ace kicker beats queen
  });

  it('returns 0 for two genuinely equal hands (split)', () => {
    const a = evaluateHand(cards('As', 'Kh', 'Qd', 'Jc', '9s'));
    const b = evaluateHand(cards('Ad', 'Kc', 'Qs', 'Jh', '9d'));
    expect(compareHands(a, b)).toBe(0);
  });

  it('finds the best five from seven cards', () => {
    // Hole cards make a set; board offers a flush draw that misses.
    const best = evaluateBestHand(cards('As', 'Ah'), cards('Ad', 'Kh', 'Qh', '2c', '3d'));
    expect(best.rank).toBe(HandRank.ThreeOfAKind);
    expect(best.tiebreakers[0]).toBe(14);
  });
});
