import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server.js';
import type { Player } from '../src/game-manager.js';

const stubPlayer: Player = {
  async chooseMove(engine) {
    return { san: engine.legalMoves()[0], comment: 'stub', fallback: false };
  },
};

describe('server', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  afterEach(async () => {
    await app?.close();
  });

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
      method: 'POST',
      url: '/api/games',
      payload: {
        white: { kind: 'claude', model: 'opus' },
        black: { kind: 'claude', model: 'opus' },
        speedMs: 0,
      },
    });
    await new Promise((r) => setTimeout(r, 50)); // let the stub game finish
    const res = await app.inject({ method: 'GET', url: '/api/games/current/pgn' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('1.');
  });
});
