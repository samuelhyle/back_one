import { describe, it, expect } from 'vitest';
import { GameLogic, INITIAL_BOARD } from './gameLogic';

describe('GameLogic', () => {
  it('rollDice returns two values between 1 and 6', () => {
    const [a, b] = GameLogic.rollDice();
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(6);
    expect(b).toBeGreaterThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(6);
  });

  it('canMoveToPoint allows moving to empty or same-color points', () => {
    const board = {
      0: { color: 'white', count: 1 },
      1: { color: 'black', count: 2 },
    };
    expect(GameLogic.canMoveToPoint(board, 2, 'white')).toBe(true);
    expect(GameLogic.canMoveToPoint(board, 0, 'white')).toBe(true);
    expect(GameLogic.canMoveToPoint(board, 1, 'white')).toBe(false);
  });

  it('canMoveToPoint allows hitting single opposing checker', () => {
    const board = {
      1: { color: 'black', count: 1 },
    };
    expect(GameLogic.canMoveToPoint(board, 1, 'white')).toBe(true);
  });

  it('makeMove moves a checker and updates counts', () => {
    const board = {
      0: { color: 'white', count: 1 },
    };
    const bar = { white: 0, black: 0 };
    const bornOff = { white: 0, black: 0 };
    const move = { from: 0, to: 1, die: 1 };

    const result = GameLogic.makeMove(board, bar, bornOff, move, 'white');
    expect(result.board[0]).toBeUndefined();
    expect(result.board[1]).toEqual({ color: 'white', count: 1 });
  });

  it('bear off increases bornOff count and removes checker when last one', () => {
    const board = {
      23: { color: 'white', count: 1 },
    };
    const bar = { white: 0, black: 0 };
    const bornOff = { white: 0, black: 0 };
    const move = { from: 23, to: 'off', die: 1 };

    const result = GameLogic.makeMove(board, bar, bornOff, move, 'white');
    expect(result.board[23]).toBeUndefined();
    expect(result.bornOff.white).toBe(1);
  });

  it('checkWinner detects winner when 15 checkers are borne off', () => {
    const bornOff = { white: 15, black: 0 };
    expect(GameLogic.checkWinner(bornOff)).toBe('white');
  });

  it('enforces bar priority: if a player has checkers on the bar, only bar-entry moves are legal', () => {
    const board = { 0: { color: 'white', count: 1 } };
    const bar = { white: 1, black: 0 };
    const bornOff = { white: 0, black: 0 };
    const dice = [1, 2];

    const moves = GameLogic.getAvailableMoves(board, dice, 'white', bar, bornOff);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.from === 'bar')).toBe(true);
  });

  it('forces the higher die when only one die can be played', () => {
    // White checker on point 0: die=1 is blocked by two black checkers on point 1, die=6 is playable.
    const board = {
      0: { color: 'white', count: 1 },
      1: { color: 'black', count: 2 }
    };
    const bar = { white: 0, black: 0 };
    const bornOff = { white: 0, black: 0 };
    const dice = [1, 6];

    const moves = GameLogic.getAvailableMoves(board, dice, 'white', bar, bornOff);
    expect(moves.length).toBe(1);
    expect(moves[0].die).toBe(6);
    expect(moves[0].from).toBe(0);
    expect(moves[0].to).toBe(6);
  });

  it('requires using the maximum number of dice when possible (both dice playable)', () => {
    const board = { 0: { color: 'white', count: 1 } };
    const bar = { white: 0, black: 0 };
    const bornOff = { white: 0, black: 0 };
    const dice = [1, 2];

    const moves = GameLogic.getAvailableMoves(board, dice, 'white', bar, bornOff);
    // Both orders are legal first moves (0->1 using die=1, or 0->2 using die=2)
    const targets = new Set(moves.map(m => m.to));
    expect(targets.has(1)).toBe(true);
    expect(targets.has(2)).toBe(true);
  });
});

