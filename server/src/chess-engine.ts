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
