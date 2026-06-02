# Move Timing & Next-Move Indicator — Design

**Date:** 2026-06-02
**Status:** Approved
**Builds on:** [AI Chess Arena](2026-06-02-ai-chess-arena-design.md)

## Overview

Add per-move timing to the AI Chess Arena: each move records when it was played
(wall-clock) and how long the side took to produce it (duration), and a live indicator
under the board shows the time until the next move — counting down the pacing delay, then
showing a live "Thinking…" timer while Claude computes.

## Goals

- Show, per move, the **wall-clock time** it was played and the **duration** it took.
- Show a live **next-move indicator** that counts down the pacing delay, then counts up
  while the side to move is thinking.

## Non-Goals

- No chess clocks / time controls (this is informational, not a competitive clock).
- No persistence of timing data beyond the live game.
- No new backend endpoints.

## Backend

`MoveEvent` gains two fields:

- `timestamp: number` — epoch ms when the move was emitted.
- `durationMs: number` — how long the moving side took for this move.

`GameManager` records `turnStartedAt` (epoch ms) at the start of each ply, **after** any
pacing delay, so duration reflects only the side's own time:

- **AI move** — `durationMs` = time spent in `player.chooseMove()` (Claude thinking time),
  excluding the pacing delay between moves.
- **Human move** — `durationMs` = time from the human's turn beginning until
  `submitHumanMove` is called.

Both paths set `timestamp = Date.now()` at emit. This is ordinary Node runtime where
`Date.now()` is available.

## Frontend

### State
- `HistoryEntry` carries `timestamp` and `durationMs`; the reducer copies them from each
  `MoveEvent`.
- `speedMs` and `paused` move from `Controls` local state up into `App` state, so both
  `Controls` and the new `NextMoveTimer` read the same values. `Controls` becomes a
  controlled component (props: `speedMs`, `paused`, and setters that also send the WS
  command).

### Timestamp display
- **MoveList** — each SAN shows a dim duration beside it (e.g. `e4` · `6.2s`); the cell's
  `title` attribute holds the wall-clock time on hover.
- **CommentaryPanel** — each bubble shows a dim meta line `HH:MM:SS · 6.2s`.

### NextMoveTimer (new component, beneath the board near Controls)
A live indicator driven by a local `setInterval` (~10 fps) that resets whenever a new move
lands (effect keyed on `history.length`, capturing `lastMoveAt = Date.now()` at receipt to
avoid client/server clock skew).

Its displayed phase is computed by a **pure function**:

```ts
computeTimerPhase({
  now: number;
  lastMoveAt: number | null;
  speedMs: number;
  paused: boolean;
  over: boolean;
  isHumanTurn: boolean;
}): { label: string; kind: 'over' | 'paused' | 'human' | 'countdown' | 'thinking' }
```

Phase rules (first match wins):
1. `over` → "Game over"
2. `paused` → "Paused"
3. `isHumanTurn` → "Your move"
4. `lastMoveAt && now - lastMoveAt < speedMs` → "Next move in {remaining}s" (countdown)
5. otherwise → "Thinking… {elapsed since delay ended}s" (counts up until next move)

`isHumanTurn` and the side to move are derived from `history.length` (even ⇒ White to
move) and `humanColor`. When `lastMoveAt` is null (no moves yet), the very first move is
treated as a "Thinking…" phase once a game is running.

## Testing (TDD)

- **Backend:** extend the game-manager test to assert every `MoveEvent` has a numeric
  `timestamp` and `durationMs >= 0`.
- **Frontend:**
  - Reducer test — a move event stores `timestamp` and `durationMs` in the history entry.
  - `computeTimerPhase` unit tests — one per phase (over, paused, human, countdown,
    thinking), pure inputs, no fake timers.
  - Update existing MoveList / CommentaryPanel render tests for the new meta text.

## Components touched

| File | Change |
|---|---|
| `server/src/types.ts` & `web/src/types.ts` | add `timestamp`, `durationMs` to `MoveEvent` |
| `server/src/game-manager.ts` | record `turnStartedAt`; emit timing fields |
| `web/src/useGameSocket.ts` | reducer stores timing on `HistoryEntry` |
| `web/src/App.tsx` | lift `speedMs`/`paused`; render `NextMoveTimer` |
| `web/src/components/Controls.tsx` | controlled by `App` |
| `web/src/components/MoveList.tsx` | per-move duration + tooltip |
| `web/src/components/CommentaryPanel.tsx` | meta line |
| `web/src/components/NextMoveTimer.tsx` (new) | live indicator + `computeTimerPhase` |
