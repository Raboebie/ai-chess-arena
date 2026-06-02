import { useEffect, useRef, useState } from 'react';
import type { Color } from '../types';

export type TimerKind = 'over' | 'paused' | 'human' | 'countdown' | 'thinking';
export interface TimerPhase {
  label: string;
  kind: TimerKind;
}

export function computeTimerPhase(input: {
  now: number;
  lastMoveAt: number | null;
  speedMs: number;
  paused: boolean;
  over: boolean;
  isHumanTurn: boolean;
}): TimerPhase {
  const { now, lastMoveAt, speedMs, paused, over, isHumanTurn } = input;
  if (over) return { kind: 'over', label: 'Game over' };
  if (paused) return { kind: 'paused', label: 'Paused' };
  if (isHumanTurn) return { kind: 'human', label: 'Your move' };
  if (lastMoveAt != null) {
    const sinceMove = now - lastMoveAt;
    if (sinceMove < speedMs) {
      const remaining = (speedMs - sinceMove) / 1000;
      return { kind: 'countdown', label: `Next move in ${remaining.toFixed(1)}s` };
    }
    const thinking = (sinceMove - speedMs) / 1000;
    return { kind: 'thinking', label: `Thinking… ${thinking.toFixed(1)}s` };
  }
  return { kind: 'thinking', label: 'Thinking…' };
}

interface Props {
  active: boolean; // a game has been started
  plies: number; // history.length
  humanColor: Color | null;
  speedMs: number;
  paused: boolean;
  over: boolean;
}

export function NextMoveTimer({ active, plies, humanColor, speedMs, paused, over }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const lastMoveAtRef = useRef<number | null>(null);

  // Reset the anchor whenever a new move lands (use client receipt time to avoid skew).
  useEffect(() => {
    lastMoveAtRef.current = plies === 0 ? null : Date.now();
    setNow(Date.now());
  }, [plies]);

  // Tick while the clock is meaningfully running.
  useEffect(() => {
    if (!active || over || paused) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active, over, paused]);

  if (!active) return null;

  const sideToMove: Color = plies % 2 === 0 ? 'w' : 'b';
  const isHumanTurn = humanColor === sideToMove;
  const phase = computeTimerPhase({
    now,
    lastMoveAt: lastMoveAtRef.current,
    speedMs,
    paused,
    over,
    isHumanTurn,
  });

  const color =
    phase.kind === 'thinking'
      ? 'var(--accent)'
      : phase.kind === 'over'
        ? 'var(--muted)'
        : 'var(--text)';

  return (
    <div style={{ fontSize: 13, color, marginTop: 6, minHeight: 18 }} className="timer">
      {phase.label}
    </div>
  );
}
