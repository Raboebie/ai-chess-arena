import { describe, it, expect } from 'vitest';
import { computeTimerPhase } from './NextMoveTimer';

const base = {
  now: 10_000,
  lastMoveAt: 9_000,
  speedMs: 1500,
  paused: false,
  over: false,
  isHumanTurn: false,
};

describe('computeTimerPhase', () => {
  it('reports game over first', () => {
    expect(computeTimerPhase({ ...base, over: true }).kind).toBe('over');
  });

  it('reports paused before turn logic', () => {
    expect(computeTimerPhase({ ...base, paused: true }).kind).toBe('paused');
  });

  it("reports the human's move", () => {
    const p = computeTimerPhase({ ...base, isHumanTurn: true });
    expect(p.kind).toBe('human');
    expect(p.label).toMatch(/your move/i);
  });

  it('counts down during the pacing delay', () => {
    const p = computeTimerPhase({ ...base, now: 9_500, lastMoveAt: 9_000, speedMs: 1500 });
    expect(p.kind).toBe('countdown');
    expect(p.label).toBe('Next move in 1.0s');
  });

  it('counts up while thinking after the delay elapses', () => {
    const p = computeTimerPhase({ ...base, now: 11_500, lastMoveAt: 9_000, speedMs: 1500 });
    expect(p.kind).toBe('thinking');
    expect(p.label).toBe('Thinking… 1.0s');
  });

  it('shows a plain thinking label before the first move', () => {
    const p = computeTimerPhase({ ...base, lastMoveAt: null });
    expect(p.kind).toBe('thinking');
    expect(p.label).toBe('Thinking…');
  });
});
