# Move Timing & Next-Move Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-move timing (wall-clock + duration) to AI Chess Arena and a live "time until next move" indicator that counts down the pacing delay then counts up while a side thinks.

**Architecture:** The backend stamps each `MoveEvent` with `timestamp` and `durationMs` (measured around each ply). The frontend stores those on history entries, displays them in the move list and commentary, and renders a `NextMoveTimer` whose phase is computed by a pure `computeTimerPhase` function.

**Tech Stack:** Existing stack — Node + TS (Fastify, chess.js, vitest) backend; Vite + React frontend.

---

## File Structure

| File | Change |
|---|---|
| `server/src/types.ts` | add `timestamp`, `durationMs` to `MoveEvent` |
| `server/src/game-manager.ts` | record `turnStartedAt`; emit timing fields |
| `server/test/game-manager.test.ts` | assert timing fields present |
| `web/src/types.ts` | mirror `MoveEvent` timing fields |
| `web/src/useGameSocket.ts` | `HistoryEntry` carries timing; reducer copies it |
| `web/src/useGameSocket.test.ts` | reducer stores timing |
| `web/src/components/NextMoveTimer.tsx` (new) | `computeTimerPhase` + live indicator |
| `web/src/components/NextMoveTimer.test.tsx` (new) | phase unit tests |
| `web/src/components/Controls.tsx` | becomes controlled (paused/speed via props) |
| `web/src/components/MoveList.tsx` | per-move duration + wall-clock tooltip |
| `web/src/components/MoveList.test.tsx` | fixtures gain timing fields |
| `web/src/components/CommentaryPanel.tsx` | per-entry meta line |
| `web/src/components/CommentaryPanel.test.tsx` | fixtures gain timing fields |
| `web/src/App.tsx` | lift `speedMs`/`paused`; render `NextMoveTimer` |

---

## Task 1: Backend — emit `timestamp` and `durationMs`

**Files:**
- Modify: `server/src/types.ts` (MoveEvent)
- Modify: `server/src/game-manager.ts`
- Test: `server/test/game-manager.test.ts`

- [ ] **Step 1: Write the failing test** — append this test inside the `describe('GameManager', ...)` block in `server/test/game-manager.test.ts`, right after the `'emits move events with incrementing ply and the moving color'` test:

```typescript
  it('stamps each move with a timestamp and a non-negative duration', async () => {
    const events: any[] = [];
    const gm = new GameManager({ ...cvc, makePlayer: () => firstMovePlayer('x') });
    gm.on('move', (e) => events.push(e));
    await new Promise<void>((resolve) => {
      gm.on('gameover', () => resolve());
      gm.start();
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(typeof e.timestamp).toBe('number');
      expect(e.timestamp).toBeGreaterThan(0);
      expect(typeof e.durationMs).toBe('number');
      expect(e.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test game-manager`
Expected: FAIL — `e.timestamp` is `undefined` (typeof is `'undefined'`, not `'number'`).

- [ ] **Step 3: Add the fields to `MoveEvent`** in `server/src/types.ts`. The interface currently ends with `captured?: string;`. Add two fields so it reads:

```typescript
export interface MoveEvent {
  type: 'move';
  ply: number; // 1-based half-move count
  color: Color; // side that just moved
  san: string; // e.g. 'Nf3'
  fen: string; // resulting position
  comment?: string; // reasoning / persona banter
  fallback: boolean; // true if a random legal move was used
  captured?: string; // captured piece letter (lowercase), if any
  timestamp: number; // epoch ms when the move was emitted
  durationMs: number; // how long the moving side took for this move
}
```

- [ ] **Step 4: Record turn-start time in `server/src/game-manager.ts`.** Add a field next to the other private fields (after `private humanResolver: ((ok: boolean) => void) | null = null;`):

```typescript
  private turnStartedAt = 0;
```

- [ ] **Step 5: Set `turnStartedAt` at the start of each ply.** In `playOnePly`, the method currently begins:

```typescript
  private async playOnePly(): Promise<void> {
    if (this.finished) return;
    const color = this.engine.turn();
```

Change it to set the timer immediately after the finished-check:

```typescript
  private async playOnePly(): Promise<void> {
    if (this.finished) return;
    this.turnStartedAt = Date.now();
    const color = this.engine.turn();
```

- [ ] **Step 6: Stamp the fields in `emitMove`.** Replace the entire `emitMove` method with:

```typescript
  private emitMove(choice: PlayerChoice, color: Color, captured?: string): void {
    const now = Date.now();
    const ev: MoveEvent = {
      type: 'move',
      ply: this.engine.history().length,
      color,
      san: this.engine.history().at(-1)!,
      fen: this.engine.fen(),
      comment: choice.comment,
      fallback: choice.fallback,
      captured,
      timestamp: now,
      durationMs: Math.max(0, now - this.turnStartedAt),
    };
    this.emit('move', ev);
  }
```

(`submitHumanMove` and the AI path both already call `emitMove`, and both reach `playOnePly` first — which now sets `turnStartedAt` — so human and AI moves are both measured: AI duration = Claude thinking time, human duration = time from their turn starting until they dropped the piece.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm --prefix server test game-manager`
Expected: PASS (7 tests, including the new one).

- [ ] **Step 8: Run the full backend suite + build**

Run: `npm --prefix server test && npm --prefix server run build`
Expected: all tests pass; `tsc` succeeds.

- [ ] **Step 9: Commit**

```bash
git add server/src/types.ts server/src/game-manager.ts server/test/game-manager.test.ts
git commit -m "feat: stamp moves with timestamp and duration"
```

---

## Task 2: Frontend — store timing on history entries

**Files:**
- Modify: `web/src/types.ts` (MoveEvent mirror)
- Modify: `web/src/useGameSocket.ts`
- Test: `web/src/useGameSocket.test.ts`

- [ ] **Step 1: Update the failing test** in `web/src/useGameSocket.test.ts`. Replace the first test (`'applies a move event to history and fen'`) with this version that includes timing:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm run test:run -- useGameSocket`
Expected: FAIL — history entry is missing `timestamp` and `durationMs`.

- [ ] **Step 3: Mirror the fields in `web/src/types.ts`.** Add the same two fields to the `MoveEvent` interface so it ends:

```typescript
export interface MoveEvent {
  type: 'move';
  ply: number;
  color: Color;
  san: string;
  fen: string;
  comment?: string;
  fallback: boolean;
  captured?: string;
  timestamp: number;
  durationMs: number;
}
```

- [ ] **Step 4: Carry timing on `HistoryEntry` and copy it in the reducer** in `web/src/useGameSocket.ts`. Update the `HistoryEntry` interface:

```typescript
export interface HistoryEntry {
  san: string;
  color: Color;
  comment?: string;
  fallback: boolean;
  timestamp: number;
  durationMs: number;
}
```

And in `gameReducer`, replace the `case 'move':` block with:

```typescript
    case 'move':
      return {
        ...state,
        fen: ev.fen,
        history: [
          ...state.history,
          {
            san: ev.san,
            color: ev.color,
            comment: ev.comment,
            fallback: ev.fallback,
            timestamp: ev.timestamp,
            durationMs: ev.durationMs,
          },
        ],
      };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm run test:run -- useGameSocket`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/useGameSocket.ts web/src/useGameSocket.test.ts
git commit -m "feat: store move timing on history entries"
```

---

## Task 3: NextMoveTimer component + `computeTimerPhase`

**Files:**
- Create: `web/src/components/NextMoveTimer.tsx`
- Test: `web/src/components/NextMoveTimer.test.tsx`

- [ ] **Step 1: Write the failing test** in `web/src/components/NextMoveTimer.test.tsx`:

```tsx
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
    // 500ms elapsed of a 1500ms delay -> ~1.0s remaining
    const p = computeTimerPhase({ ...base, now: 9_500, lastMoveAt: 9_000, speedMs: 1500 });
    expect(p.kind).toBe('countdown');
    expect(p.label).toBe('Next move in 1.0s');
  });

  it('counts up while thinking after the delay elapses', () => {
    // 2500ms since move, 1500ms delay -> thinking 1.0s
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm run test:run -- NextMoveTimer`
Expected: FAIL — `computeTimerPhase` not found.

- [ ] **Step 3: Implement `web/src/components/NextMoveTimer.tsx`:**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm run test:run -- NextMoveTimer`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/NextMoveTimer.tsx web/src/components/NextMoveTimer.test.tsx
git commit -m "feat: add NextMoveTimer with computeTimerPhase"
```

---

## Task 4: Wire timing into the UI (App, Controls, MoveList, CommentaryPanel)

**Files:**
- Modify: `web/src/components/Controls.tsx`
- Modify: `web/src/components/MoveList.tsx` + `web/src/components/MoveList.test.tsx`
- Modify: `web/src/components/CommentaryPanel.tsx` + `web/src/components/CommentaryPanel.test.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Update MoveList + CommentaryPanel test fixtures (failing first).**

In `web/src/components/MoveList.test.tsx`, the history fixtures lack the now-required `timestamp`/`durationMs`. Replace the `render(...)` call's history with:

```tsx
    render(
      <MoveList
        history={[
          { san: 'e4', color: 'w', fallback: false, timestamp: 1717322000000, durationMs: 6200 },
          { san: 'e5', color: 'b', fallback: false, timestamp: 1717322007000, durationMs: 5100 },
          { san: 'Nf3', color: 'w', fallback: false, timestamp: 1717322013000, durationMs: 4300 },
        ]}
      />,
    );
```

Then add this assertion at the end of the same test (it asserts the duration is shown):

```tsx
    expect(screen.getByText(/6\.2s/)).toBeInTheDocument();
```

In `web/src/components/CommentaryPanel.test.tsx`, replace the `history` constant with:

```tsx
const history = [
  { san: 'e4', color: 'w' as const, comment: 'Center control.', fallback: false, timestamp: 1717322000000, durationMs: 6200 },
  { san: 'c5', color: 'b' as const, comment: 'Sicilian!', fallback: false, timestamp: 1717322007000, durationMs: 5100 },
];
```

- [ ] **Step 2: Run tests to verify the new MoveList assertion fails**

Run: `cd web && npm run test:run -- MoveList`
Expected: FAIL — no element with text `6.2s` yet (duration not rendered).

- [ ] **Step 3: Show duration + wall-clock tooltip in `web/src/components/MoveList.tsx`.** Replace the two `<td>` cells that render white/black with versions that append a dim duration and a `title` tooltip:

```tsx
              <td title={r.white ? new Date(r.white.timestamp).toLocaleTimeString() : undefined}>
                {r.white && (
                  <span style={{ color: r.white.fallback ? '#ffb4b4' : 'inherit' }}>
                    {r.white.san}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {(r.white.durationMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                )}
              </td>
              <td title={r.black ? new Date(r.black.timestamp).toLocaleTimeString() : undefined}>
                {r.black && (
                  <span style={{ color: r.black.fallback ? '#ffb4b4' : 'inherit' }}>
                    {r.black.san}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {(r.black.durationMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                )}
              </td>
```

- [ ] **Step 4: Add the meta line in `web/src/components/CommentaryPanel.tsx`.** Inside the `withComments.map(...)` bubble, add a meta line as the first child of the bubble `<div>`, before the `<span>` with the side/SAN:

```tsx
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                {new Date(h.timestamp).toLocaleTimeString()} · {(h.durationMs / 1000).toFixed(1)}s
              </div>
```

- [ ] **Step 5: Run tests to verify MoveList + CommentaryPanel pass**

Run: `cd web && npm run test:run -- MoveList CommentaryPanel`
Expected: PASS.

- [ ] **Step 6: Make `Controls` controlled.** Replace the entire contents of `web/src/components/Controls.tsx` with:

```tsx
import type { ClientMessage } from '../types';

interface Props {
  send: (m: ClientMessage) => void;
  paused: boolean;
  speedMs: number;
  onPaused: (paused: boolean) => void;
  onSpeed: (ms: number) => void;
  onNewGame: () => void;
  over: boolean;
  result?: string;
  reason?: string;
}

export function Controls({
  send,
  paused,
  speedMs,
  onPaused,
  onSpeed,
  onNewGame,
  over,
  result,
  reason,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        marginTop: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            send({ type: 'pause' });
            onPaused(true);
          }}
        >
          ⏸ Pause
        </button>
        <button
          className="primary"
          onClick={() => {
            send({ type: 'play' });
            onPaused(false);
          }}
        >
          ▶ Play
        </button>
        <button onClick={() => send({ type: 'step' })} disabled={!paused}>
          ⏭ Step
        </button>
        <button onClick={onNewGame}>＋ New</button>
        <button
          onClick={() => {
            window.location.href = '/api/games/current/pgn';
          }}
        >
          ⬇ PGN
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Speed</span>
        <input
          type="range"
          min={0}
          max={4000}
          step={250}
          value={speedMs}
          onChange={(e) => {
            const ms = Number(e.target.value);
            onSpeed(ms);
            send({ type: 'speed', ms });
          }}
        />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{(speedMs / 1000).toFixed(2)}s</span>
      </div>
      {over && (
        <div className="title">
          Game over — {result} ({reason})
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Lift state and render the timer in `web/src/App.tsx`.** Replace the entire file with:

```tsx
import { useState } from 'react';
import './theme.css';
import { useGameSocket } from './useGameSocket';
import { BoardView } from './components/BoardView';
import { MoveList } from './components/MoveList';
import { CommentaryPanel } from './components/CommentaryPanel';
import { Controls } from './components/Controls';
import { NextMoveTimer } from './components/NextMoveTimer';
import { SetupModal } from './components/SetupModal';
import type { NewGameRequest } from './types';

export default function App() {
  const { state, send } = useGameSocket();
  const [setupOpen, setSetupOpen] = useState(true);
  const [humanColor, setHumanColor] = useState<'w' | 'b' | null>(null);
  const [speedMs, setSpeedMs] = useState(1500);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);

  async function startGame(req: NewGameRequest) {
    await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    setHumanColor(req.white.kind === 'human' ? 'w' : req.black.kind === 'human' ? 'b' : null);
    setSpeedMs(req.speedMs);
    setPaused(false);
    setStarted(true);
    setSetupOpen(false);
  }

  return (
    <div className="app">
      <div className="col">
        <div className="title">♟ AI Chess Arena</div>
        {state.error && <div className="banner">{state.error}</div>}
        <MoveList history={state.history} />
      </div>

      <div className="col center">
        <BoardView
          fen={state.fen}
          humanColor={humanColor}
          onMove={(from, to, promotion) => send({ type: 'humanMove', from, to, promotion })}
        />
        <NextMoveTimer
          active={started}
          plies={state.history.length}
          humanColor={humanColor}
          speedMs={speedMs}
          paused={paused}
          over={state.over}
        />
        <Controls
          send={send}
          paused={paused}
          speedMs={speedMs}
          onPaused={setPaused}
          onSpeed={setSpeedMs}
          onNewGame={() => setSetupOpen(true)}
          over={state.over}
          result={state.result}
          reason={state.reason}
        />
      </div>

      <div className="col">
        <CommentaryPanel history={state.history} />
      </div>

      {setupOpen && <SetupModal onStart={startGame} onClose={() => setSetupOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 8: Full type-check / build**

Run: `cd web && npm run build`
Expected: PASS — `tsc -b && vite build` with no errors.

- [ ] **Step 9: Full web test suite**

Run: `cd web && npm run test:run`
Expected: PASS (useGameSocket, MoveList, CommentaryPanel, NextMoveTimer).

- [ ] **Step 10: Commit**

```bash
git add web/src/components/Controls.tsx web/src/components/MoveList.tsx web/src/components/MoveList.test.tsx web/src/components/CommentaryPanel.tsx web/src/components/CommentaryPanel.test.tsx web/src/App.tsx
git commit -m "feat: show move timing and live next-move indicator in UI"
```

---

## Self-Review Notes

- **Spec coverage:** timestamp+duration fields (Task 1), frontend storage (Task 2), MoveList duration + tooltip and Commentary meta line (Task 4), NextMoveTimer with all five phases via `computeTimerPhase` (Task 3), lifted `speedMs`/`paused` + controlled Controls (Task 4). All covered.
- **Type consistency:** `MoveEvent` gains `timestamp`/`durationMs` in both `server/src/types.ts` and `web/src/types.ts`; `HistoryEntry` and the reducer match; `Controls` prop rename (`onPaused`, `onSpeed`, `paused`, `speedMs`) is reflected in the `App.tsx` call site in the same task.
- **Existing-test impact:** MoveList and CommentaryPanel fixtures are updated in Task 4 (same task that requires the fields), and the reducer test in Task 2 — so the suite never has a knowingly-broken intermediate commit beyond the intended TDD red step.
