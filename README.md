# ♟ AI Chess Arena

Watch **Claude play Claude**, or **play against Claude yourself**. Moves are driven by
your local `claude -p` CLI (your Claude subscription — no API key, no per-token billing)
and validated by [`chess.js`](https://github.com/jhlywa/chess.js), so games are always
legal no matter how creative Claude gets.

Features:

- **Claude vs Claude** (spectate) and **Human vs Claude** (play) modes
- Live **commentary** panel — toggle between full reasoning, persona banter, or off
- **Pacing controls** — play / pause / step and a speed slider
- **Move list** with fallback-move highlighting
- **PGN export** of the finished game
- **Model & persona picker** per side (e.g. "aggressive attacker" vs "careful defender")
- **Neon Arena** theme

## Architecture

```
Browser (Vite + React)  ──WebSocket──►  Node + TS server (Fastify)
   BoardView / MoveList                    ├─ game-manager   (turn loop, pacing, events)
   CommentaryPanel / Controls              ├─ claude-player  (prompt → `claude -p` → validated move)
   SetupModal                              └─ chess-engine   (chess.js: rules, PGN, game-over)
```

The game is turn-based, so at most one `claude -p` process runs at a time. Every move
Claude proposes is validated against the rules engine; illegal or unparseable replies are
re-prompted up to 3 times, then a random legal move is played as a flagged fallback.

See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the
implementation plan.

## Requirements

- Node 22+
- The [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed and
  authenticated. Run `claude` once interactively to log in if you haven't.

## Run

```bash
npm --prefix server install
npm --prefix web install

npm run dev:server   # terminal 1 — http://localhost:3001
npm run dev:web      # terminal 2 — open the printed Vite URL (e.g. http://localhost:5173)
```

Open the Vite URL, choose a mode in the setup modal, and start a game. In
**You vs Claude**, drag a piece to move; illegal drags snap back (the server is
authoritative).

## Test

```bash
npm --prefix server run test      # backend unit tests (chess engine, player, game loop, server)
npm --prefix web run test:run     # frontend tests (reducer + components)
```

## Project layout

```
server/   Node + TS backend (Fastify, chess.js, spawns `claude -p`)
web/      Vite + React frontend (react-chessboard, WebSocket)
docs/     design spec + implementation plan
```
