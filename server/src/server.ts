import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { GameManager } from './game-manager.js';
import type { Player } from './game-manager.js';
import { ClaudePlayer } from './claude-player.js';
import { SpawnCliRunner } from './cli-runner.js';
import type { Color, NewGameRequest, ClientMessage, ServerEvent } from './types.js';

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
    for (const s of sockets) {
      try {
        s.send(msg);
      } catch {
        /* dropped */
      }
    }
  }

  const defaultMakePlayer = (side: Color, cfg: NewGameRequest): Player | null => {
    const sideCfg = side === 'w' ? cfg.white : cfg.black;
    if (sideCfg.kind === 'human') return null;
    return new ClaudePlayer(new SpawnCliRunner(), {
      model: sideCfg.model ?? 'sonnet',
      persona: sideCfg.persona,
    });
  };

  app.post<{ Body: NewGameRequest }>('/api/games', async (req, reply) => {
    const cfg = req.body;
    const make = opts.makePlayer ?? defaultMakePlayer;
    if (game) game.stop(); // halt any previous game so it stops broadcasting moves
    game = new GameManager({
      white: cfg.white,
      black: cfg.black,
      speedMs: cfg.speedMs,
      makePlayer: (side) => make(side, cfg),
    });
    game.on('move', broadcast);
    game.on('gameover', broadcast);
    game.start();
    return reply.send({ ok: true });
  });

  app.get('/api/games/current/pgn', async (_req, reply) => {
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
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'play':
          game.play();
          break;
        case 'pause':
          game.pause();
          break;
        case 'step':
          void game.step();
          break;
        case 'speed':
          game.setSpeed(msg.ms);
          break;
        case 'humanMove':
          game.submitHumanMove(msg.from, msg.to, msg.promotion);
          break;
      }
    });
  });

  return app;
}

// Entry point when run directly (via `tsx src/server.ts` or compiled `server.js`).
const entry = process.argv[1] ?? '';
if (entry.endsWith('server.ts') || entry.endsWith('server.js')) {
  const port = Number(process.env.PORT ?? 3001);
  const app = await buildServer();
  await app.listen({ port, host: '127.0.0.1' });
  // eslint-disable-next-line no-console
  console.log(`AI Chess Arena server on http://localhost:${port}`);
}
