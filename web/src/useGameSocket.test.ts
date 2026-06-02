import { describe, it, expect } from 'vitest';
import { gameReducer, initialGameState } from './useGameSocket';

describe('gameReducer', () => {
  it('applies a move event to history and fen', () => {
    const s = gameReducer(initialGameState, {
      type: 'move',
      ply: 1,
      color: 'w',
      san: 'e4',
      fen: 'after-e4',
      fallback: false,
      comment: 'center',
      timestamp: 1717322000000,
      durationMs: 6200,
    });
    expect(s.history).toEqual([
      {
        san: 'e4',
        color: 'w',
        comment: 'center',
        fallback: false,
        timestamp: 1717322000000,
        durationMs: 6200,
      },
    ]);
    expect(s.fen).toBe('after-e4');
  });

  it('records game over', () => {
    const s = gameReducer(initialGameState, {
      type: 'gameover',
      result: '1-0',
      reason: 'checkmate',
      pgn: '1. e4',
    });
    expect(s.over).toBe(true);
    expect(s.result).toBe('1-0');
  });
});
