# AI Chess Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app to watch Claude play Claude (or play Claude yourself), driven by the local `claude -p` CLI, with legal moves guaranteed by `chess.js`, live commentary, pacing controls, and PGN export.

**Architecture:** A Node + TypeScript backend owns game state via `chess.js`, generates AI moves by spawning `claude -p`, validates every move, and streams events to a Vite + React frontend over WebSocket. The game is turn-based, so at most one `claude -p` process runs at a time. The frontend renders the board (react-chessboard), move list, commentary feed, and controls.

**Tech Stack:** Node 22, TypeScript, Fastify (+ `@fastify/websocket`), `chess.js`, Vitest. Frontend: Vite, React, `react-chessboard`.

---

## Repository Layout

```
chess/
├── server/                 # backend (Node + TS)
│   ├── src/
│   │   ├── types.ts            # shared contract (events, configs)
│   │   ├── chess-engine.ts     # chess.js wrapper
│   │   ├── cli-runner.ts       # CliRunner interface + real spawn impl
│   │   ├── claude-player.ts     # prompt -> claude -p -> validated move
│   │   ├── game-manager.ts     # turn loop, pacing, events
│   │   └── server.ts           # Fastify HTTP + WS
│   ├── test/                   # vitest specs
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
└── web/                    # frontend (Vite + React)
    ├── src/
    │   ├── types.ts            # mirrors server/src/types.ts contract
    │   ├── useGameSocket.ts
    │   ├── components/
    │   │   ├── BoardView.tsx
    │   │   ├── MoveList.tsx
    │   │   ├── CommentaryPanel.tsx
    │   │   ├── Controls.tsx
    │   │   └── SetupModal.tsx
    │   ├── App.tsx
    │   ├── theme.css
    │   └── main.tsx
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

The `server/src/types.ts` contract is the single source of truth for the event/control protocol. `web/src/types.ts` is a hand-kept copy of the same definitions (no shared build step in v1).

---

## Shared Contract (defined in Task 2, referenced everywhere)

```typescript
// Colors and player kinds
export type Color = 'w' | 'b';
export type PlayerKind = 'claude' | 'human';

// Per-side configuration chosen in the setup modal
export interface SideConfig {
  kind: PlayerKind;
  model?: string;    // e.g. 'opus', 'sonnet' — required when kind === 'claude'
  persona?: string;  // optional flavor text, e.g. 'aggressive attacker'
}

export interface NewGameRequest {
  white: SideConfig;
  black: SideConfig;
  speedMs: number;   // delay between auto-played moves
}

// Server -> client events
export interface MoveEvent {
  type: 'move';
  ply: number;        // 1-based half-move count
  color: Color;       // side that just moved
  san: string;        // e.g. 'Nf3'
  fen: string;        // resulting position
  comment?: string;   // reasoning / persona banter
  fallback: boolean;  // true if a random legal move was used
  captured?: string;  // captured piece letter (lowercase), if any
}

export interface GameOverEvent {
  type: 'gameover';
  result: string;     // '1-0', '0-1', '1/2-1/2'
  reason: string;     // 'checkmate', 'stalemate', 'insufficient material', ...
  pgn: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

// Full snapshot sent right after a client connects
export interface StateEvent {
  type: 'state';
  fen: string;
  history: string[];   // SAN
  turn: Color;
  paused: boolean;
  speedMs: number;
  white: SideConfig;
  black: SideConfig;
  over: boolean;
}

export type ServerEvent = MoveEvent | GameOverEvent | ErrorEvent | StateEvent;

// Client -> server control messages
export type ClientMessage =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'speed'; ms: number }
  | { type: 'humanMove'; from: string; to: string; promotion?: string };
```

---

## Task 1: Scaffold the monorepo

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
- Create: `web/` via Vite scaffold
- Create: `package.json` (root, for convenience scripts)

- [ ] **Step 1: Create the server package**

Run:
```bash
mkdir -p server/src server/test
cd server && npm init -y && \
npm pkg set type=module && \
npm pkg set scripts.dev="tsx watch src/server.ts" && \
npm pkg set scripts.test="vitest run" && \
npm pkg set scripts.build="tsc" && \
npm install chess.js fastify @fastify/websocket && \
npm install -D typescript tsx vitest @types/node && \
cd ..
```
Expected: `server/node_modules` populated, `chess.js` and `fastify` in dependencies.

- [ ] **Step 2: Add `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Add `server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 4: Scaffold the web app**

Run:
```bash
npm create vite@latest web -- --template react-ts && \
cd web && npm install && npm install chess.js react-chessboard && \
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom && cd ..
```
Expected: `web/` contains a working Vite React-TS app.

- [ ] **Step 5: Configure the Vite dev proxy** so the frontend can reach the backend.

Replace `web/vite.config.ts` with:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/setupTests.ts' },
});
```

Create `web/src/setupTests.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 6: Add root convenience scripts**

Create root `package.json`:
```json
{
  "name": "ai-chess-arena",
  "private": true,
  "scripts": {
    "dev:server": "npm --prefix server run dev",
    "dev:web": "npm --prefix web run dev",
    "test": "npm --prefix server test && npm --prefix web run test -- --run"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold server and web packages"
```

---

## Task 2: Shared types + ChessEngine (TDD)

**Files:**
- Create: `server/src/types.ts`
- Create: `server/src/chess-engine.ts`
- Test: `server/test/chess-engine.test.ts`

- [ ] **Step 1: Create `server/src/types.ts`**

Paste the entire **Shared Contract** block from above into `server/src/types.ts`.

- [ ] **Step 2: Write the failing test** in `server/test/chess-engine.test.ts`

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix server test`
Expected: FAIL — `ChessEngine` not found.

- [ ] **Step 4: Implement `server/src/chess-engine.ts`**

```typescript
import { Chess } from 'chess.js';
import type { Color } from './types.js';

export interface MoveResult {
  san: string;
  captured?: string; // captured piece letter (lowercase)
}

export class ChessEngine {
  private chess: Chess;
  private capturedByWhite: string[] = [];
  private capturedByBlack: string[] = [];

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  legalMoves(): string[] {
    return this.chess.moves();
  }

  private record(captured: string | undefined, mover: Color) {
    if (!captured) return;
    if (mover === 'w') this.capturedByWhite.push(captured);
    else this.capturedByBlack.push(captured);
  }

  move(san: string): MoveResult | null {
    const mover = this.chess.turn();
    try {
      const m = this.chess.move(san);
      this.record(m.captured, mover);
      return { san: m.san, captured: m.captured };
    } catch {
      return null;
    }
  }

  moveFromTo(from: string, to: string, promotion?: string): MoveResult | null {
    const mover = this.chess.turn();
    try {
      const m = this.chess.move({ from, to, promotion: promotion ?? 'q' });
      this.record(m.captured, mover);
      return { san: m.san, captured: m.captured };
    } catch {
      return null;
    }
  }

  fen(): string { return this.chess.fen(); }
  turn(): Color { return this.chess.turn(); }
  history(): string[] { return this.chess.history(); }
  pgn(): string { return this.chess.pgn(); }
  isGameOver(): boolean { return this.chess.isGameOver(); }
  capturedPieces(): { w: string[]; b: string[] } {
    return { w: [...this.capturedByWhite], b: [...this.capturedByBlack] };
  }

  result(): { over: boolean; result?: string; reason?: string } {
    if (!this.chess.isGameOver()) return { over: false };
    const winner = this.chess.turn() === 'w' ? '0-1' : '1-0'; // side to move is mated
    if (this.chess.isCheckmate()) return { over: true, result: winner, reason: 'checkmate' };
    if (this.chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    if (this.chess.isInsufficientMaterial())
      return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
    if (this.chess.isThreefoldRepetition())
      return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
    return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix server test`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/types.ts server/src/chess-engine.ts server/test/chess-engine.test.ts
git commit -m "feat: add shared types and ChessEngine with tests"
```

---

## Task 3: CliRunner interface + spawn implementation

**Files:**
- Create: `server/src/cli-runner.ts`
- Test: `server/test/cli-runner.test.ts`

- [ ] **Step 1: Write the failing test** in `server/test/cli-runner.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SpawnCliRunner } from '../src/cli-runner.js';

describe('SpawnCliRunner', () => {
  it('runs a command and returns stdout', async () => {
    // Use `cat` as a stand-in CLI: echoes stdin to stdout.
    const runner = new SpawnCliRunner('cat', []);
    const out = await runner.run('hello world', 'ignored-model');
    expect(out.trim()).toBe('hello world');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test cli-runner`
Expected: FAIL — `SpawnCliRunner` not found.

- [ ] **Step 3: Implement `server/src/cli-runner.ts`**

The prompt is sent on **stdin** (avoids shell-escaping issues with long prompts). The real Claude invocation is `claude -p --model <model>`, reading the prompt from stdin.

```typescript
import { spawn } from 'node:child_process';

export interface CliRunner {
  run(prompt: string, model: string): Promise<string>;
}

/** Spawns a CLI, writes the prompt to stdin, resolves with stdout. */
export class SpawnCliRunner implements CliRunner {
  constructor(
    private command = 'claude',
    private baseArgs: string[] = ['-p'],
    private timeoutMs = 60_000,
  ) {}

  run(prompt: string, model: string): Promise<string> {
    const args = model ? [...this.baseArgs, '--model', model] : this.baseArgs;
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`CLI timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(`CLI exited ${code}: ${stderr || stdout}`));
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test cli-runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/cli-runner.ts server/test/cli-runner.test.ts
git commit -m "feat: add CliRunner with spawn implementation"
```

---

## Task 4: ClaudePlayer — prompt, parse, validate, retry, fallback (TDD)

**Files:**
- Create: `server/src/claude-player.ts`
- Test: `server/test/claude-player.test.ts`

- [ ] **Step 1: Write the failing test** in `server/test/claude-player.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../src/chess-engine.js';
import { ClaudePlayer } from '../src/claude-player.js';
import type { CliRunner } from '../src/cli-runner.js';

/** A scripted runner that returns queued responses in order. */
class FakeRunner implements CliRunner {
  public prompts: string[] = [];
  constructor(private responses: string[]) {}
  async run(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return this.responses.shift() ?? '';
  }
}

describe('ClaudePlayer', () => {
  it('parses a valid JSON move and comment', async () => {
    const runner = new FakeRunner(['{"move": "e4", "comment": "Center control."}']);
    const player = new ClaudePlayer(runner, { model: 'opus' });
    const r = await player.chooseMove(new ChessEngine(), 'w');
    expect(r.san).toBe('e4');
    expect(r.comment).toBe('Center control.');
    expect(r.fallback).toBe(false);
  });

  it('extracts JSON even when wrapped in prose or code fences', async () => {
    const runner = new FakeRunner(['Sure!\n```json\n{"move":"Nf3","comment":"Develop."}\n```']);
    const player = new ClaudePlayer(runner, { model: 'opus' });
    const r = await player.chooseMove(new ChessEngine(), 'w');
    expect(r.san).toBe('Nf3');
  });

  it('re-prompts after an illegal move, then accepts a legal one', async () => {
    const runner = new FakeRunner([
      '{"move": "e5", "comment": "oops illegal"}', // illegal for white from start
      '{"move": "d4", "comment": "ok"}',
    ]);
    const player = new ClaudePlayer(runner, { model: 'opus' });
    const r = await player.chooseMove(new ChessEngine(), 'w');
    expect(r.san).toBe('d4');
    expect(r.fallback).toBe(false);
    expect(runner.prompts.length).toBe(2);
    expect(runner.prompts[1]).toContain('illegal');
  });

  it('falls back to a random legal move after 3 failures', async () => {
    const runner = new FakeRunner(['garbage', 'still bad', '{"move":"Zz9"}', 'nope']);
    const player = new ClaudePlayer(runner, { model: 'opus' });
    const engine = new ChessEngine();
    const r = await player.chooseMove(engine, 'w');
    expect(r.fallback).toBe(true);
    expect(engine.legalMoves()).toContain(r.san); // a real legal move was chosen
  });

  it('includes FEN, history, and legal moves in the prompt', async () => {
    const runner = new FakeRunner(['{"move":"e4"}']);
    const player = new ClaudePlayer(runner, { model: 'opus', persona: 'aggressive' });
    await player.chooseMove(new ChessEngine(), 'w');
    const p = runner.prompts[0];
    expect(p).toContain('FEN');
    expect(p).toContain('aggressive');
    expect(p).toContain('e4'); // legal move list
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test claude-player`
Expected: FAIL — `ClaudePlayer` not found.

- [ ] **Step 3: Implement `server/src/claude-player.ts`**

`pickRandom` uses `Math.random`. Note: in the Workflow scripting environment `Math.random` is unavailable, but this is ordinary application runtime code (Node), where it is fine.

```typescript
import type { CliRunner } from './cli-runner.js';
import type { ChessEngine } from './chess-engine.js';
import type { Color } from './types.js';

export interface PlayerChoice {
  san: string;
  comment?: string;
  fallback: boolean;
}

const MAX_ATTEMPTS = 3;

export class ClaudePlayer {
  constructor(
    private runner: CliRunner,
    private opts: { model: string; persona?: string },
  ) {}

  async chooseMove(engine: ChessEngine, color: Color): Promise<PlayerChoice> {
    const legal = engine.legalMoves();
    let lastError = '';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const prompt = this.buildPrompt(engine, color, legal, lastError);
      let raw: string;
      try {
        raw = await this.runner.run(prompt, this.opts.model);
      } catch (err) {
        lastError = `The engine errored: ${(err as Error).message}. Reply with valid JSON.`;
        continue;
      }
      const parsed = extractMove(raw);
      if (!parsed) {
        lastError = 'Your last reply was not valid JSON of the form {"move":"<SAN>","comment":"..."}.';
        continue;
      }
      if (!legal.includes(parsed.move)) {
        lastError = `"${parsed.move}" is illegal. Choose exactly one SAN move from: ${legal.join(', ')}.`;
        continue;
      }
      return { san: parsed.move, comment: parsed.comment, fallback: false };
    }

    // Fallback: random legal move
    const san = legal[Math.floor(Math.random() * legal.length)];
    return { san, comment: '(fallback: engine could not produce a legal move)', fallback: true };
  }

  private buildPrompt(engine: ChessEngine, color: Color, legal: string[], lastError: string): string {
    const side = color === 'w' ? 'White' : 'Black';
    const persona = this.opts.persona ? `Your playing style: ${this.opts.persona}.\n` : '';
    const history = engine.history().join(' ') || '(no moves yet)';
    const correction = lastError ? `\nIMPORTANT: ${lastError}\n` : '';
    return [
      `You are playing chess as ${side}.`,
      persona,
      `Current position FEN: ${engine.fen()}`,
      `Move history (SAN): ${history}`,
      `Legal moves you may choose from: ${legal.join(', ')}`,
      correction,
      `Choose your move. Reply with ONLY a JSON object, no other text:`,
      `{"move": "<one SAN move from the legal list>", "comment": "<one or two sentences explaining it>"}`,
    ].join('\n');
  }
}

/** Tolerantly extract the first JSON object with a `move` field from text. */
export function extractMove(text: string): { move: string; comment?: string } | null {
  // Find each {...} candidate and try to parse it.
  const candidates = text.match(/\{[^{}]*\}/g) ?? [];
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj.move === 'string') {
        return { move: obj.move.trim(), comment: typeof obj.comment === 'string' ? obj.comment : undefined };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test claude-player`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/claude-player.ts server/test/claude-player.test.ts
git commit -m "feat: add ClaudePlayer with retry and fallback"
```

---

## Task 5: GameManager — turn loop, pacing, events (TDD)

**Files:**
- Create: `server/src/game-manager.ts`
- Test: `server/test/game-manager.test.ts`

`GameManager` does not depend on `ClaudePlayer` directly; it accepts a `Player` interface so tests can inject a stub. Human sides are represented by a `null` player (the manager waits for `submitHumanMove`).

- [ ] **Step 1: Write the failing test** in `server/test/game-manager.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
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
    await new Promise<void>((resolve) => { gm.on('gameover', () => resolve()); gm.start(); });
    expect(events[0].ply).toBe(1);
    expect(events[0].color).toBe('w');
    expect(events[1].color).toBe('b');
  });

  it('does not auto-advance while paused, and step() plays exactly one ply', async () => {
    const gm = new GameManager({ ...cvc, makePlayer: () => firstMovePlayer('x'), startPaused: true });
    const seen: string[] = [];
    gm.on('move', (e) => seen.push(e.san));
    gm.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.length).toBe(0);          // paused: nothing happened
    await gm.step();
    expect(seen.length).toBe(1);          // exactly one ply
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
    expect(seen.length).toBe(0);                 // waiting for human
    const ok = gm.submitHumanMove('e2', 'e4');
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.map((e) => e.san)).toEqual(['e4', expect.any(String)]); // human + claude reply
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test game-manager`
Expected: FAIL — `GameManager` not found.

- [ ] **Step 3: Implement `server/src/game-manager.ts`**

```typescript
import { EventEmitter } from 'node:events';
import { ChessEngine } from './chess-engine.js';
import type { Color, SideConfig, MoveEvent, GameOverEvent } from './types.js';

export interface PlayerChoice { san: string; comment?: string; fallback: boolean }
export interface Player { chooseMove(engine: ChessEngine, color: Color): Promise<PlayerChoice> }

export interface GameManagerOpts {
  white: SideConfig;
  black: SideConfig;
  speedMs: number;
  startPaused?: boolean;
  makePlayer: (side: Color) => Player | null; // null => human
}

export class GameManager extends EventEmitter {
  private engine = new ChessEngine();
  private players: Record<Color, Player | null>;
  private paused: boolean;
  private speedMs: number;
  private running = false;
  private finished = false;
  private resumeWaiters: Array<() => void> = [];
  private humanResolver: ((ok: boolean) => void) | null = null;

  constructor(private opts: GameManagerOpts) {
    super();
    this.players = { w: opts.makePlayer('w'), b: opts.makePlayer('b') };
    this.paused = !!opts.startPaused;
    this.speedMs = opts.speedMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  pause(): void { this.paused = true; }
  play(): void {
    this.paused = false;
    const w = this.resumeWaiters; this.resumeWaiters = []; w.forEach((fn) => fn());
  }
  setSpeed(ms: number): void { this.speedMs = ms; }

  /** Advance exactly one ply while paused. */
  async step(): Promise<void> {
    if (this.finished) return;
    await this.playOnePly();
  }

  submitHumanMove(from: string, to: string, promotion?: string): boolean {
    if (this.engine.turn() && this.players[this.engine.turn()] !== null) return false; // not human's turn
    const res = this.engine.moveFromTo(from, to, promotion);
    if (!res) return false;
    const color = this.engine.turn() === 'w' ? 'b' : 'w'; // side that just moved
    this.emitMove({ san: res.san, comment: undefined, fallback: false }, color, res.captured);
    if (this.humanResolver) { const r = this.humanResolver; this.humanResolver = null; r(true); }
    return true;
  }

  pgn(): string { return this.engine.pgn(); }

  private async loop(): Promise<void> {
    while (!this.finished) {
      if (this.paused) { await this.waitForResume(); continue; }
      await this.playOnePly();
      if (this.finished) break;
      if (!this.paused && this.speedMs > 0) await delay(this.speedMs);
    }
  }

  private async playOnePly(): Promise<void> {
    if (this.finished) return;
    const color = this.engine.turn();
    const player = this.players[color];

    if (player === null) {
      // Human turn: wait until submitHumanMove resolves.
      await new Promise<boolean>((resolve) => { this.humanResolver = resolve; });
    } else {
      const choice = await player.chooseMove(this.engine, color);
      const res = this.engine.move(choice.san);
      const applied = res ?? this.engine.move(this.engine.legalMoves()[0])!; // defensive
      this.emitMove(choice, color, applied.captured);
    }
    this.checkGameOver();
  }

  private emitMove(choice: PlayerChoice, color: Color, captured?: string): void {
    const ev: MoveEvent = {
      type: 'move',
      ply: this.engine.history().length,
      color,
      san: this.engine.history().at(-1)!,
      fen: this.engine.fen(),
      comment: choice.comment,
      fallback: choice.fallback,
      captured,
    };
    this.emit('move', ev);
  }

  private checkGameOver(): void {
    const r = this.engine.result();
    if (r.over) {
      this.finished = true;
      const ev: GameOverEvent = {
        type: 'gameover',
        result: r.result!,
        reason: r.reason!,
        pgn: this.engine.pgn(),
      };
      this.emit('gameover', ev);
    }
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test game-manager`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/game-manager.ts server/test/game-manager.test.ts
git commit -m "feat: add GameManager turn loop with pacing and events"
```

---

## Task 6: Fastify server — REST + WebSocket

**Files:**
- Create: `server/src/server.ts`
- Test: `server/test/server.test.ts`

The server holds a single active `GameManager` (one game at a time in v1). `POST /api/games` starts a new game; `GET /api/games/current/pgn` exports PGN; the WebSocket at `/ws` streams events and accepts `ClientMessage` control commands.

- [ ] **Step 1: Write the failing test** in `server/test/server.test.ts`

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server.js';
import type { Player } from '../src/game-manager.js';

const stubPlayer: Player = {
  async chooseMove(engine) { return { san: engine.legalMoves()[0], comment: 'stub', fallback: false }; },
};

describe('server', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  afterEach(async () => { await app?.close(); });

  it('starts a game and returns 200', async () => {
    app = await buildServer({ makePlayer: () => stubPlayer });
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      payload: {
        white: { kind: 'claude', model: 'opus' },
        black: { kind: 'claude', model: 'opus' },
        speedMs: 0,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('exports PGN after a game has run', async () => {
    app = await buildServer({ makePlayer: () => stubPlayer });
    await app.inject({
      method: 'POST', url: '/api/games',
      payload: { white: { kind: 'claude', model: 'opus' }, black: { kind: 'claude', model: 'opus' }, speedMs: 0 },
    });
    await new Promise((r) => setTimeout(r, 50)); // let the stub game finish
    const res = await app.inject({ method: 'GET', url: '/api/games/current/pgn' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('1.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test server`
Expected: FAIL — `buildServer` not found.

- [ ] **Step 3: Implement `server/src/server.ts`**

`buildServer` accepts an optional `makePlayer` override so tests inject stub players; production builds a `ClaudePlayer` backed by `SpawnCliRunner`.

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { GameManager } from './game-manager.js';
import type { Player } from './game-manager.js';
import { ClaudePlayer } from './claude-player.js';
import { SpawnCliRunner } from './cli-runner.js';
import type { Color, NewGameRequest, ClientMessage, ServerEvent, StateEvent } from './types.js';

export interface BuildOpts {
  // Inject players for tests; default builds real ClaudePlayers.
  makePlayer?: (side: Color, cfg: NewGameRequest) => Player | null;
}

export async function buildServer(opts: BuildOpts = {}) {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  let game: GameManager | null = null;
  const sockets = new Set<{ send: (s: string) => void }>();

  function broadcast(ev: ServerEvent) {
    const msg = JSON.stringify(ev);
    for (const s of sockets) { try { s.send(msg); } catch { /* dropped */ } }
  }

  const defaultMakePlayer = (side: Color, cfg: NewGameRequest): Player | null => {
    const sideCfg = side === 'w' ? cfg.white : cfg.black;
    if (sideCfg.kind === 'human') return null;
    return new ClaudePlayer(new SpawnCliRunner(), { model: sideCfg.model ?? 'sonnet', persona: sideCfg.persona });
  };

  app.post<{ Body: NewGameRequest }>('/api/games', async (req, reply) => {
    const cfg = req.body;
    const make = opts.makePlayer ?? defaultMakePlayer;
    game = new GameManager({
      white: cfg.white, black: cfg.black, speedMs: cfg.speedMs,
      makePlayer: (side) => make(side, cfg),
    });
    game.on('move', broadcast);
    game.on('gameover', broadcast);
    game.start();
    return reply.send({ ok: true });
  });

  app.get('/api/games/current/pgn', async (req, reply) => {
    if (!game) return reply.code(404).send('no game');
    return reply.header('content-type', 'application/x-chess-pgn').send(game.pgn());
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const conn = { send: (s: string) => socket.send(s) };
    sockets.add(conn);
    socket.on('close', () => sockets.delete(conn));
    socket.on('message', (raw: Buffer) => {
      if (!game) return;
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.type) {
        case 'play': game.play(); break;
        case 'pause': game.pause(); break;
        case 'step': void game.step(); break;
        case 'speed': game.setSpeed(msg.ms); break;
        case 'humanMove': game.submitHumanMove(msg.from, msg.to, msg.promotion); break;
      }
    });
  });

  return app;
}

// Entry point when run directly.
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const app = await buildServer();
  await app.listen({ port: 3001, host: '127.0.0.1' });
  // eslint-disable-next-line no-console
  console.log('AI Chess Arena server on http://localhost:3001');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test server`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full backend suite**

Run: `npm --prefix server test`
Expected: PASS (all tasks' tests green).

- [ ] **Step 6: Commit**

```bash
git add server/src/server.ts server/test/server.test.ts
git commit -m "feat: add Fastify server with REST and WebSocket"
```

---

## Task 7: Frontend types + game socket hook

**Files:**
- Create: `web/src/types.ts`
- Create: `web/src/useGameSocket.ts`
- Test: `web/src/useGameSocket.test.ts`

- [ ] **Step 1: Create `web/src/types.ts`**

Copy the entire **Shared Contract** block into `web/src/types.ts` (identical to `server/src/types.ts`).

- [ ] **Step 2: Write the failing test** in `web/src/useGameSocket.test.ts`

This tests the pure reducer that folds events into UI state (the socket wiring itself is thin and verified manually in Task 12).

```typescript
import { describe, it, expect } from 'vitest';
import { gameReducer, initialGameState } from './useGameSocket';

describe('gameReducer', () => {
  it('applies a move event to history and fen', () => {
    const s = gameReducer(initialGameState, {
      type: 'move', ply: 1, color: 'w', san: 'e4',
      fen: 'after-e4', fallback: false, comment: 'center',
    });
    expect(s.history).toEqual([{ san: 'e4', color: 'w', comment: 'center', fallback: false }]);
    expect(s.fen).toBe('after-e4');
  });

  it('records game over', () => {
    const s = gameReducer(initialGameState, {
      type: 'gameover', result: '1-0', reason: 'checkmate', pgn: '1. e4',
    });
    expect(s.over).toBe(true);
    expect(s.result).toBe('1-0');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix web run test -- --run useGameSocket`
Expected: FAIL — `gameReducer` not found.

- [ ] **Step 4: Implement `web/src/useGameSocket.ts`**

```typescript
import { useEffect, useReducer, useRef, useCallback } from 'react';
import type { ServerEvent, ClientMessage, Color } from './types';

export interface HistoryEntry { san: string; color: Color; comment?: string; fallback: boolean }

export interface GameState {
  fen: string;
  history: HistoryEntry[];
  over: boolean;
  result?: string;
  reason?: string;
  error?: string;
  pgn?: string;
}

export const initialGameState: GameState = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  history: [],
  over: false,
};

export function gameReducer(state: GameState, ev: ServerEvent): GameState {
  switch (ev.type) {
    case 'state':
      return { ...state, fen: ev.fen, over: ev.over };
    case 'move':
      return {
        ...state,
        fen: ev.fen,
        history: [...state.history, { san: ev.san, color: ev.color, comment: ev.comment, fallback: ev.fallback }],
      };
    case 'gameover':
      return { ...state, over: true, result: ev.result, reason: ev.reason, pgn: ev.pgn };
    case 'error':
      return { ...state, error: ev.message };
    default:
      return state;
  }
}

export function useGameSocket() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (e) => dispatch(JSON.parse(e.data) as ServerEvent);
    return () => ws.close();
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return { state, send };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix web run test -- --run useGameSocket`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/useGameSocket.ts web/src/useGameSocket.test.ts
git commit -m "feat: add frontend types and game socket hook"
```

---

## Task 8: Theme + app shell (Layout A, Neon Arena)

**Files:**
- Create: `web/src/theme.css`
- Modify: `web/src/App.tsx`
- Modify: `web/src/main.tsx`
- Modify: `web/index.html`

- [ ] **Step 1: Create `web/src/theme.css`** (Neon Arena palette, Layout A grid)

```css
:root {
  --bg: #0a0e14;
  --panel: #0f1620;
  --panel-2: #13202b;
  --accent: #1de9b6;
  --accent-dim: #06281f;
  --text: #e8f7f2;
  --muted: #7c9aa0;
  --light-sq: #cdd9d6;
  --dark-sq: #38606a;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; }
.app { display: grid; grid-template-columns: 280px minmax(360px, 1fr) 320px; gap: 16px; padding: 16px; height: 100vh; }
.col { background: var(--panel); border-radius: 12px; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.center { background: transparent; align-items: center; }
.title { color: var(--accent); font-weight: 700; letter-spacing: .04em; }
.panel-h { text-transform: uppercase; font-size: 11px; letter-spacing: .08em; color: var(--muted); margin: 0 0 8px; }
.glow { box-shadow: 0 0 12px rgba(29,233,182,.35); }
button { background: var(--panel-2); color: var(--text); border: 1px solid #1f3a44; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
.banner { background: #3a1414; color: #ffb4b4; padding: 8px 12px; border-radius: 8px; }
```

- [ ] **Step 2: Replace `web/src/App.tsx`** with the Layout A shell

```tsx
import { useState } from 'react';
import './theme.css';
import { useGameSocket } from './useGameSocket';
import { BoardView } from './components/BoardView';
import { MoveList } from './components/MoveList';
import { CommentaryPanel } from './components/CommentaryPanel';
import { Controls } from './components/Controls';
import { SetupModal } from './components/SetupModal';
import type { NewGameRequest } from './types';

export default function App() {
  const { state, send } = useGameSocket();
  const [setupOpen, setSetupOpen] = useState(true);
  const [humanColor, setHumanColor] = useState<'w' | 'b' | null>(null);

  async function startGame(req: NewGameRequest) {
    await fetch('/api/games', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req),
    });
    setHumanColor(req.white.kind === 'human' ? 'w' : req.black.kind === 'human' ? 'b' : null);
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
        <BoardView fen={state.fen} humanColor={humanColor} onMove={(from, to, promotion) =>
          send({ type: 'humanMove', from, to, promotion })} />
        <Controls send={send} onNewGame={() => setSetupOpen(true)} over={state.over}
          result={state.result} reason={state.reason} />
      </div>

      <div className="col">
        <CommentaryPanel history={state.history} />
      </div>

      {setupOpen && <SetupModal onStart={startGame} onClose={() => setSetupOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Ensure `web/src/main.tsx` renders `App`** (Vite default already does; confirm it imports `./App`). If it imports the demo, replace its body with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 4: Set the page title** in `web/index.html` — change `<title>` to `AI Chess Arena`.

- [ ] **Step 5: Commit**

```bash
git add web/src/theme.css web/src/App.tsx web/src/main.tsx web/index.html
git commit -m "feat: add Neon Arena theme and Layout A app shell"
```

> Note: `App.tsx` imports components created in Tasks 9–12. The app will not type-check until those exist; that's expected. Build verification happens at the end of Task 12.

---

## Task 9: BoardView component

**Files:**
- Create: `web/src/components/BoardView.tsx`

`react-chessboard`'s prop API has changed across major versions. Write the component against the installed version and let TypeScript be the source of truth — run `npm --prefix web run build` and fix prop names if `tsc` reports mismatches. The behavior to implement is fixed: render `fen`, and when `humanColor` is set and it's that side's turn, call `onMove(from, to, promotion?)` on a drop, returning whether the move was accepted optimistically (server is authoritative).

- [ ] **Step 1: Implement `web/src/components/BoardView.tsx`**

```tsx
import { Chessboard } from 'react-chessboard';
import type { Color } from '../types';

interface Props {
  fen: string;
  humanColor: Color | null;
  onMove: (from: string, to: string, promotion?: string) => void;
}

export function BoardView({ fen, humanColor, onMove }: Props) {
  // react-chessboard v4 uses an `options` object. If the installed version
  // differs, tsc will flag it — adjust prop names to match the installed types.
  return (
    <div style={{ width: 'min(70vh, 560px)' }} className="glow">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: humanColor === 'b' ? 'black' : 'white',
          darkSquareStyle: { backgroundColor: 'var(--dark-sq)' },
          lightSquareStyle: { backgroundColor: 'var(--light-sq)' },
          allowDragging: humanColor !== null,
          onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
            if (!targetSquare) return false;
            onMove(sourceSquare, targetSquare, 'q');
            return true; // optimistic; server validates and broadcasts truth
          },
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm --prefix web run build`
Expected: If `react-chessboard`'s API differs, fix the prop names per the tsc error, then rebuild. (Other components still missing will also error — that's fine until Task 12.)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/BoardView.tsx
git commit -m "feat: add BoardView board component"
```

---

## Task 10: MoveList component (TDD)

**Files:**
- Create: `web/src/components/MoveList.tsx`
- Test: `web/src/components/MoveList.test.tsx`

- [ ] **Step 1: Write the failing test** in `web/src/components/MoveList.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoveList } from './MoveList';

describe('MoveList', () => {
  it('renders moves paired by number', () => {
    render(<MoveList history={[
      { san: 'e4', color: 'w', fallback: false },
      { san: 'e5', color: 'b', fallback: false },
      { san: 'Nf3', color: 'w', fallback: false },
    ]} />);
    expect(screen.getByText('e4')).toBeInTheDocument();
    expect(screen.getByText('Nf3')).toBeInTheDocument();
    expect(screen.getByText(/1\./)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web run test -- --run MoveList`
Expected: FAIL — `MoveList` not found.

- [ ] **Step 3: Implement `web/src/components/MoveList.tsx`**

```tsx
import type { HistoryEntry } from '../useGameSocket';

export function MoveList({ history }: { history: HistoryEntry[] }) {
  const rows: { n: number; white?: HistoryEntry; black?: HistoryEntry }[] = [];
  history.forEach((entry, i) => {
    const n = Math.floor(i / 2);
    rows[n] ??= { n: n + 1 };
    if (entry.color === 'w') rows[n].white = entry; else rows[n].black = entry;
  });

  return (
    <div>
      <h3 className="panel-h">Moves</h3>
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td style={{ color: 'var(--muted)', width: 28 }}>{r.n}.</td>
              <td>{r.white && <span style={{ color: r.white.fallback ? '#ffb4b4' : 'inherit' }}>{r.white.san}</span>}</td>
              <td>{r.black && <span style={{ color: r.black.fallback ? '#ffb4b4' : 'inherit' }}>{r.black.san}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web run test -- --run MoveList`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/MoveList.tsx web/src/components/MoveList.test.tsx
git commit -m "feat: add MoveList component"
```

---

## Task 11: CommentaryPanel component (TDD)

**Files:**
- Create: `web/src/components/CommentaryPanel.tsx`
- Test: `web/src/components/CommentaryPanel.test.tsx`

- [ ] **Step 1: Write the failing test** in `web/src/components/CommentaryPanel.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommentaryPanel } from './CommentaryPanel';

const history = [
  { san: 'e4', color: 'w' as const, comment: 'Center control.', fallback: false },
  { san: 'c5', color: 'b' as const, comment: 'Sicilian!', fallback: false },
];

describe('CommentaryPanel', () => {
  it('shows commentary by default', () => {
    render(<CommentaryPanel history={history} />);
    expect(screen.getByText(/Center control/)).toBeInTheDocument();
  });

  it('hides commentary when toggled off', () => {
    render(<CommentaryPanel history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /off/i }));
    expect(screen.queryByText(/Center control/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web run test -- --run CommentaryPanel`
Expected: FAIL — `CommentaryPanel` not found.

- [ ] **Step 3: Implement `web/src/components/CommentaryPanel.tsx`**

```tsx
import { useState } from 'react';
import type { HistoryEntry } from '../useGameSocket';

type Mode = 'reasoning' | 'persona' | 'off';

export function CommentaryPanel({ history }: { history: HistoryEntry[] }) {
  const [mode, setMode] = useState<Mode>('reasoning');
  const withComments = history.filter((h) => h.comment);

  return (
    <div>
      <h3 className="panel-h">Commentary</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['reasoning', 'persona', 'off'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'primary' : ''} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      {mode !== 'off' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {withComments.map((h, i) => (
            <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 8, padding: '6px 10px' }}>
              <span style={{ color: 'var(--accent)' }}>{h.color === 'w' ? 'White' : 'Black'} {h.san}:</span>{' '}
              {h.comment}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web run test -- --run CommentaryPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/CommentaryPanel.tsx web/src/components/CommentaryPanel.test.tsx
git commit -m "feat: add CommentaryPanel with mode toggle"
```

---

## Task 12: Controls + SetupModal, and full build

**Files:**
- Create: `web/src/components/Controls.tsx`
- Create: `web/src/components/SetupModal.tsx`

- [ ] **Step 1: Implement `web/src/components/Controls.tsx`**

```tsx
import { useState } from 'react';
import type { ClientMessage } from '../types';

interface Props {
  send: (m: ClientMessage) => void;
  onNewGame: () => void;
  over: boolean;
  result?: string;
  reason?: string;
}

export function Controls({ send, onNewGame, over, result, reason }: Props) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1500);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { send({ type: 'pause' }); setPaused(true); }}>⏸ Pause</button>
        <button className="primary" onClick={() => { send({ type: 'play' }); setPaused(false); }}>▶ Play</button>
        <button onClick={() => send({ type: 'step' })} disabled={!paused}>⏭ Step</button>
        <button onClick={onNewGame}>＋ New</button>
        <button onClick={() => { window.location.href = '/api/games/current/pgn'; }}>⬇ PGN</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Speed</span>
        <input type="range" min={0} max={4000} step={250} value={speed}
          onChange={(e) => { const ms = Number(e.target.value); setSpeed(ms); send({ type: 'speed', ms }); }} />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{(speed / 1000).toFixed(2)}s</span>
      </div>
      {over && <div className="title">Game over — {result} ({reason})</div>}
    </div>
  );
}
```

- [ ] **Step 2: Implement `web/src/components/SetupModal.tsx`**

```tsx
import { useState } from 'react';
import type { NewGameRequest, PlayerKind } from '../types';

const MODELS = ['opus', 'sonnet', 'haiku'];

export function SetupModal({ onStart, onClose }: { onStart: (r: NewGameRequest) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'cvc' | 'hvc'>('cvc');
  const [humanColor, setHumanColor] = useState<'w' | 'b'>('w');
  const [whiteModel, setWhiteModel] = useState('opus');
  const [blackModel, setBlackModel] = useState('sonnet');
  const [whitePersona, setWhitePersona] = useState('');
  const [blackPersona, setBlackPersona] = useState('');

  function start() {
    const claudeW = { kind: 'claude' as PlayerKind, model: whiteModel, persona: whitePersona || undefined };
    const claudeB = { kind: 'claude' as PlayerKind, model: blackModel, persona: blackPersona || undefined };
    const human = { kind: 'human' as PlayerKind };
    const req: NewGameRequest =
      mode === 'cvc'
        ? { white: claudeW, black: claudeB, speedMs: 1500 }
        : humanColor === 'w'
          ? { white: human, black: claudeB, speedMs: 1500 }
          : { white: claudeW, black: human, speedMs: 1500 };
    onStart(req);
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center' } as const;
  const card = { background: 'var(--panel)', padding: 24, borderRadius: 12, width: 420, display: 'flex', flexDirection: 'column', gap: 12 } as const;

  return (
    <div style={overlay}>
      <div style={card} className="glow">
        <div className="title">New Game</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={mode === 'cvc' ? 'primary' : ''} onClick={() => setMode('cvc')}>Claude vs Claude</button>
          <button className={mode === 'hvc' ? 'primary' : ''} onClick={() => setMode('hvc')}>You vs Claude</button>
        </div>

        {mode === 'hvc' && (
          <label>You play:{' '}
            <select value={humanColor} onChange={(e) => setHumanColor(e.target.value as 'w' | 'b')}>
              <option value="w">White</option><option value="b">Black</option>
            </select>
          </label>
        )}

        {(mode === 'cvc' || humanColor === 'b') && (
          <Side label="White (Claude)" model={whiteModel} setModel={setWhiteModel}
            persona={whitePersona} setPersona={setWhitePersona} />
        )}
        {(mode === 'cvc' || humanColor === 'w') && (
          <Side label="Black (Claude)" model={blackModel} setModel={setBlackModel}
            persona={blackPersona} setPersona={setBlackPersona} />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={start}>Start</button>
        </div>
      </div>
    </div>
  );
}

function Side(props: {
  label: string; model: string; setModel: (s: string) => void; persona: string; setPersona: (s: string) => void;
}) {
  return (
    <div style={{ background: 'var(--panel-2)', padding: 10, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong>{props.label}</strong>
      <label>Model:{' '}
        <select value={props.model} onChange={(e) => props.setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <input placeholder="Persona (optional), e.g. aggressive attacker"
        value={props.persona} onChange={(e) => props.setPersona(e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 3: Full type-check and build**

Run: `npm --prefix web run build`
Expected: PASS — all components now exist; no tsc errors. If `react-chessboard` props errored in Task 9, fix them now against the installed types.

- [ ] **Step 4: Run the full web test suite**

Run: `npm --prefix web run test -- --run`
Expected: PASS (useGameSocket, MoveList, CommentaryPanel).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Controls.tsx web/src/components/SetupModal.tsx
git commit -m "feat: add Controls and SetupModal, complete frontend"
```

---

## Task 13: End-to-end smoke test (manual)

**Files:** none (verification only)

- [ ] **Step 1: Start the backend**

Run: `npm run dev:server`
Expected: `AI Chess Arena server on http://localhost:3001`.

- [ ] **Step 2: Start the frontend** (separate terminal)

Run: `npm run dev:web`
Expected: Vite prints a local URL (e.g. http://localhost:5173).

- [ ] **Step 3: Watch a Claude-vs-Claude game**

Open the Vite URL. In the setup modal, keep "Claude vs Claude", pick models, click **Start**. Confirm:
- Moves appear on the board with animation.
- Move list fills in on the left.
- Commentary appears on the right; toggling **off** hides it.
- Pause / Play / Step and the speed slider behave.
- If `claude` isn't logged in, an error banner explains it. (Fix: run `claude` once interactively to authenticate, then retry.)

- [ ] **Step 4: Play a game as human**

New game → "You vs Claude" → play White → make a legal move by dragging. Confirm Claude replies and illegal drags are rejected (board snaps back after server ignores them).

- [ ] **Step 5: Export PGN**

Click **⬇ PGN**. Confirm a PGN downloads and opens in any chess viewer.

- [ ] **Step 6: Add a README and commit**

Create `README.md`:
```markdown
# AI Chess Arena

Watch Claude play Claude, or play Claude yourself. Moves are driven by your local
`claude -p` CLI (subscription, no API key) and validated by chess.js.

## Run
```bash
npm --prefix server install && npm --prefix web install
npm run dev:server   # terminal 1 — http://localhost:3001
npm run dev:web      # terminal 2 — open the printed Vite URL
```

Requires the Claude Code CLI installed and authenticated (`claude` once interactively).
```

```bash
git add README.md && git commit -m "docs: add README"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** modes (Task 5/6/12), local CLI backend (Task 3/4), legal-move validation + retry + fallback (Task 4), live updates (Task 6/7), commentary toggle (Task 11), pacing (Task 5/12), PGN export (Task 6/12), move list + captured tracking (Task 2/10), model/persona picker (Task 12), Neon Arena + Layout A (Task 8). All covered.
- **Captured pieces UI:** the engine tracks captures (Task 2) and `MoveEvent.captured` is emitted; a captured-pieces strip in `MoveList` is a small enhancement the implementer may add using `state` from a future `StateEvent`. Not required for v1 acceptance.
- **react-chessboard API risk:** Task 9 explicitly defers to the installed version's TypeScript types — treat tsc as the source of truth.
```
