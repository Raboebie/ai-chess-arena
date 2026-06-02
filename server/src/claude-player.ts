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
        lastError =
          'Your last reply was not valid JSON of the form {"move":"<SAN>","comment":"..."}.';
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

  private buildPrompt(
    engine: ChessEngine,
    color: Color,
    legal: string[],
    lastError: string,
  ): string {
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
        return {
          move: obj.move.trim(),
          comment: typeof obj.comment === 'string' ? obj.comment : undefined,
        };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}
