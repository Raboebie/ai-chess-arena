# AI Chess Arena — Design

**Date:** 2026-06-02
**Status:** Approved

## Overview

A local web app for watching **Claude play against Claude**, or **playing against Claude yourself**. A Node + TypeScript backend drives each AI move by shelling out to the local Claude Code CLI (`claude -p`), using the existing Claude subscription — no API key, no per-token billing. A real chess rules engine (`chess.js`) is the source of truth for legality, so games are always valid no matter how creative Claude gets.

The UI uses the **Neon Arena** theme (dark slate with mint/cyan accents) in **Layout A**: board centered, move list + captured pieces on the left, live commentary on the right, pacing controls beneath the board.

## Goals

- Watch two Claude instances play a full, legal game of chess.
- Optionally play as a human against Claude.
- See each side's reasoning/personality as live commentary (toggleable).
- Control pacing (pause / step / speed) while watching.
- Export the finished game as PGN.

## Non-Goals (v1)

- No real chess engine opponent (e.g. Stockfish) — Claude only.
- No accounts, persistence across restarts, or saved game library (PGN export covers "keep the game").
- No remote/hosted deployment — runs locally.
- No opening books, eval bars, or engine analysis.

## Modes

1. **Claude vs Claude** (headline) — both sides driven by `claude -p`; user spectates.
2. **Human vs Claude** — user plays one color via drag-and-drop; Claude plays the other.

## Tech Stack

- **Backend:** Node + TypeScript, [Fastify](https://fastify.dev) (HTTP + WebSocket), `chess.js` for rules/PGN. Spawns `claude -p` per AI move.
- **Frontend:** Vite + React, `react-chessboard` for the board (smooth animation, legal-move highlighting). Live updates over WebSocket.
- **Live transport:** WebSocket (bidirectional — server streams events, client sends control commands).

## Architecture

```
Browser (Vite + React)  ──WebSocket──►  Node + TS server (Fastify)
   BoardView / MoveList                    │
   CommentaryPanel / Controls              ├─ game-manager   (turn loop, pacing, end conditions)
   SetupModal                              ├─ claude-player  (prompt → `claude -p` → validated move + comment)
   useGameSocket hook                      └─ chess-engine   (chess.js: legal moves, apply, FEN, PGN, game-over)
```

The game is turn-based, so at most **one `claude -p` process is in flight at a time**. Per-move latency is a few seconds; pacing controls make that part of the experience rather than a wait.

## The Move Protocol

The technical heart of the app. On an AI side's turn, `claude-player`:

1. **Builds a prompt** containing:
   - Role (White / Black) and persona (e.g. aggressive, positional, beginner).
   - Current board as **FEN**.
   - Move history in SAN.
   - The **list of legal moves** (from `chess-engine`).
2. **Requests strict JSON**: `{"move": "<SAN>", "comment": "<short reasoning, 1-2 sentences>"}`.
3. **Spawns `claude -p`** with the prompt and parses the JSON from the response.
4. **Validates** the returned move against `chess.js`:
   - If illegal or unparseable → **re-prompt** (up to **3 attempts**) with an explicit "that move was illegal; choose one of: […]".
   - After 3 failed attempts → play a **random legal move** and flag it in the commentary feed as a fallback.

**Rationale:** Providing the legal-move list up front makes illegal moves rare and keeps games fast (fewer retries). Each `claude -p` call is stateless, so full context (FEN + history + legal moves) is passed every time.

### Claude CLI invocation

- Headless print mode: `claude -p "<prompt>"`.
- Response parsing: extract the JSON object from Claude's output (tolerate surrounding prose / fenced code blocks).
- The CLI runner is abstracted behind an interface so it can be **mocked in tests** (no real Claude calls during testing).

## Components

### Backend

| Module | Responsibility | Depends on |
|---|---|---|
| `chess-engine` | Pure wrapper over `chess.js`: list legal moves, apply move, current FEN, SAN history, captured pieces, PGN export, game-over detection (checkmate / stalemate / draws). | `chess.js` |
| `claude-player` | Given game state + persona, return `{move, comment}`. Prompt building, CLI spawn, JSON parse, illegal-move retry, fallback. | `chess-engine` (legal moves + validation), CLI runner interface |
| `game-manager` | Orchestrate one game: whose turn, call `claude-player` or await human input, apply moves, emit events, handle pacing (pause / step / speed) and end conditions. | `chess-engine`, `claude-player` |
| `server` | Fastify HTTP + WebSocket. REST to start/configure/control games and export PGN; WS to stream events. Thin. | `game-manager` |

### Frontend

| Component | Responsibility |
|---|---|
| `BoardView` | `react-chessboard`; highlights last move; accepts human drag in Human-vs-Claude mode. |
| `MoveList` | SAN move list + captured pieces; click a move to jump the board to that position. |
| `CommentaryPanel` | Live feed; toggle between **full reasoning**, **persona banter**, and **off**. |
| `Controls` | Play / pause / step, speed slider, new game. |
| `SetupModal` | Choose mode (CvC / HvC), each side's Claude model and persona, and the human's color. |
| `useGameSocket` | WebSocket client hook holding live game state. |

## Data Flow & Control

1. **Setup:** `SetupModal` → `POST /games` with mode + per-side model/persona → backend creates a `game-manager`.
2. **Stream:** WS pushes `move`, `commentary`, and `gameover` events; the UI renders them.
3. **Control:** `Controls` send `pause` / `step` / `speed` commands over WS.
4. **Human move:** in HvC, the human's drag is validated server-side by `chess-engine`, then Claude replies via the move protocol.
5. **Export:** `GET /games/:id/pgn` returns the PGN download.

## Error Handling

- **Illegal move:** retry (3×) then random-legal fallback, flagged in feed (see Move Protocol).
- **`claude` not installed / not logged in:** spawn failure surfaces a clear UI banner explaining the fix.
- **JSON parse failure:** treated like an illegal move — re-prompt.
- **Per-move timeout:** a hung CLI call can't freeze the game; on timeout, fall back like a failed attempt.

## Testing (TDD)

- **`chess-engine`:** legal move generation, checkmate / stalemate / draw detection, PGN export, captured-piece tracking.
- **`claude-player`:** injected **fake CLI runner** returning canned and deliberately-illegal responses to prove retry + fallback paths — no real Claude calls.
- **`game-manager`:** stub player to test the turn loop, pacing (pause / step / speed), and end conditions.

## Visual Design

- **Theme:** Neon Arena — dark slate background (`#0a0e14` / `#0f1620`), mint/cyan accents (`#1de9b6`), subtle glow on active elements.
- **Layout A:** board centered and large; left column = move list + captured pieces; right column = commentary feed; pacing controls in a bar beneath the board.

## Open Questions / Future

- Stockfish opponent and eval bar (post-v1).
- Saved game library / replay browser (post-v1; PGN export covers the gap for now).
- Tournament mode (multiple games, score tracking).
