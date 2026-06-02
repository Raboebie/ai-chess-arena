import { describe, it, expect } from 'vitest';
import { SpawnCliRunner } from '../src/cli-runner.js';

describe('SpawnCliRunner', () => {
  it('runs a command and returns stdout', async () => {
    // Use `cat` as a stand-in CLI: echoes stdin to stdout.
    // Pass an empty model so no `--model` flag is appended (cat would reject it).
    const runner = new SpawnCliRunner('cat', []);
    const out = await runner.run('hello world', '');
    expect(out.trim()).toBe('hello world');
  });
});
