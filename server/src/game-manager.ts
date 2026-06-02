import { EventEmitter } from 'node:events';
import { ChessEngine } from './chess-engine.js';
import type { Color, SideConfig, MoveEvent, GameOverEvent } from './types.js';

export interface PlayerChoice {
  san: string;
  comment?: string;
  fallback: boolean;
}
export interface Player {
  chooseMove(engine: ChessEngine, color: Color): Promise<PlayerChoice>;
}

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

  pause(): void {
    this.paused = true;
  }
  play(): void {
    this.paused = false;
    const w = this.resumeWaiters;
    this.resumeWaiters = [];
    w.forEach((fn) => fn());
  }
  setSpeed(ms: number): void {
    this.speedMs = ms;
  }

  /** Advance exactly one ply while paused. */
  async step(): Promise<void> {
    if (this.finished) return;
    await this.playOnePly();
  }

  submitHumanMove(from: string, to: string, promotion?: string): boolean {
    if (this.players[this.engine.turn()] !== null) return false; // not human's turn
    const res = this.engine.moveFromTo(from, to, promotion);
    if (!res) return false;
    const color = this.engine.turn() === 'w' ? 'b' : 'w'; // side that just moved
    this.emitMove({ san: res.san, comment: undefined, fallback: false }, color, res.captured);
    if (this.humanResolver) {
      const r = this.humanResolver;
      this.humanResolver = null;
      r(true);
    }
    this.checkGameOver();
    return true;
  }

  pgn(): string {
    return this.engine.pgn();
  }

  private async loop(): Promise<void> {
    while (!this.finished) {
      if (this.paused) {
        await this.waitForResume();
        continue;
      }
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
      await new Promise<boolean>((resolve) => {
        this.humanResolver = resolve;
      });
      return; // submitHumanMove already emitted the move and checked game over
    }

    const choice = await player.chooseMove(this.engine, color);
    const res = this.engine.move(choice.san);
    const applied = res ?? this.engine.move(this.engine.legalMoves()[0])!; // defensive
    this.emitMove(choice, color, applied.captured);
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
    if (r.over && !this.finished) {
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
