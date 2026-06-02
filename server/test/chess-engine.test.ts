import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../src/chess-engine.js';

describe('ChessEngine', () => {
  it('lists legal opening moves in SAN', () => {
    const e = new ChessEngine();
    const moves = e.legalMoves();
    expect(moves).toContain('e4');
    expect(moves).toContain('Nf3');
    expect(moves.length).toBe(20);
  });

  it('applies a SAN move and advances the turn', () => {
    const e = new ChessEngine();
    const res = e.move('e4');
    expect(res).not.toBeNull();
    expect(e.turn()).toBe('b');
    expect(e.history()).toEqual(['e4']);
  });

  it('rejects an illegal SAN move', () => {
    const e = new ChessEngine();
    expect(e.move('e5')).toBeNull(); // e5 is illegal for white from start
  });

  it('detects checkmate (fool\'s mate)', () => {
    const e = new ChessEngine();
    ['f3', 'e5', 'g4', 'Qh4#'].forEach((m) => e.move(m));
    const r = e.result();
    expect(r.over).toBe(true);
    expect(r.reason).toBe('checkmate');
    expect(r.result).toBe('0-1');
  });

  it('tracks captured pieces', () => {
    const e = new ChessEngine();
    ['e4', 'd5', 'exd5'].forEach((m) => e.move(m));
    expect(e.capturedPieces().w).toContain('p'); // white captured a black pawn
  });

  it('validates a from/to human move and exposes promotion', () => {
    const e = new ChessEngine();
    const res = e.moveFromTo('e2', 'e4');
    expect(res?.san).toBe('e4');
  });

  it('produces PGN', () => {
    const e = new ChessEngine();
    ['e4', 'e5'].forEach((m) => e.move(m));
    expect(e.pgn()).toContain('1. e4 e5');
  });
});
