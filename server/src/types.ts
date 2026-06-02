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
