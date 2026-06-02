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
