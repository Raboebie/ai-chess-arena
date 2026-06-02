import { describe, it, expect } from 'vitest';
import { GameManager } from '../src/game-manager.js';
import type { Player } from '../src/game-manager.js';
import type { Color } from '../src/types.js';

/** Stub player that plays the first legal move with a fixed comment. */
function firstMovePlayer(comment: string): Player {
  return {
    async chooseMove(engine) {
      return { san: engine.legalMoves()[0], comment, fallback: false };
    },
  };
}

const cvc = {
  white: { kind: 'claude' as const, model: 'opus' },
  black: { kind: 'claude' as const, model: 'opus' },
  speedMs: 0,
};

describe('GameManager', () => {
  it('plays a full Claude-vs-Claude game and emits a gameover with PGN', async () => {
    const moves: string[] = [];
    const gm = new GameManager({
      ...cvc,
      makePlayer: () => firstMovePlayer('hi'),
    });
    gm.on('move', (e) => moves.push(e.san));
    const over = await new Promise<any>((resolve) => {
      gm.on('gameover', resolve);
      gm.start();
    });
    expect(moves.length).toBeGreaterThan(0);
    expect(over.pgn).toContain('1.');
    expect(['1-0', '0-1', '1/2-1/2']).toContain(over.result);
  });

  it('emits move events with incrementing ply and the moving color', async () => {
    const events: any[] = [];
    const gm = new GameManager({ ...cvc, makePlayer: () => firstMovePlayer('x') });
    gm.on('move', (e) => events.push(e));
    await new Promise<void>((resolve) => {
      gm.on('gameover', () => resolve());
      gm.start();
    });
    expect(events[0].ply).toBe(1);
    expect(events[0].color).toBe('w');
    expect(events[1].color).toBe('b');
  });

  it('does not auto-advance while paused, and step() plays exactly one ply', async () => {
    const gm = new GameManager({
      ...cvc,
      makePlayer: () => firstMovePlayer('x'),
      startPaused: true,
    });
    const seen: string[] = [];
    gm.on('move', (e) => seen.push(e.san));
    gm.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.length).toBe(0); // paused: nothing happened
    await gm.step();
    expect(seen.length).toBe(1); // exactly one ply
  });

  it('in human-vs-claude, waits for submitHumanMove then lets claude reply', async () => {
    const gm = new GameManager({
      white: { kind: 'human' },
      black: { kind: 'claude', model: 'opus' },
      speedMs: 0,
      makePlayer: (side: Color) => (side === 'b' ? firstMovePlayer('reply') : null),
    });
    const seen: any[] = [];
    gm.on('move', (e) => seen.push(e));
    gm.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.length).toBe(0); // waiting for human
    const ok = gm.submitHumanMove('e2', 'e4');
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.map((e) => e.san)).toEqual(['e4', expect.any(String)]); // human + claude reply
  });

  it('stop() halts the loop so no further moves are emitted', async () => {
    const gm = new GameManager({
      ...cvc,
      makePlayer: () => firstMovePlayer('x'),
      startPaused: true,
    });
    const seen: string[] = [];
    gm.on('move', (e) => seen.push(e.san));
    gm.start();
    await gm.step(); // play exactly one ply
    expect(seen.length).toBe(1);
    gm.stop();
    gm.play(); // would normally resume the loop
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.length).toBe(1); // no further moves after stop()
  });

  it('rejects an illegal human move', () => {
    const gm = new GameManager({
      white: { kind: 'human' },
      black: { kind: 'claude', model: 'opus' },
      speedMs: 0,
      makePlayer: () => firstMovePlayer('x'),
    });
    gm.start();
    expect(gm.submitHumanMove('e2', 'e5')).toBe(false);
  });
});
