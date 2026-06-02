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
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
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
