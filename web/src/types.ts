// Mirror of server/src/types.ts — the shared event/control contract.
// Keep in sync by hand (no shared build step in v1).

export type Color = 'w' | 'b';
export type PlayerKind = 'claude' | 'human';

export interface SideConfig {
  kind: PlayerKind;
  model?: string;
  persona?: string;
}

export interface NewGameRequest {
  white: SideConfig;
  black: SideConfig;
  speedMs: number;
}

export interface MoveEvent {
  type: 'move';
  ply: number;
  color: Color;
  san: string;
  fen: string;
  comment?: string;
  fallback: boolean;
  captured?: string;
  timestamp: number;
  durationMs: number;
}

export interface GameOverEvent {
  type: 'gameover';
  result: string;
  reason: string;
  pgn: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export interface StateEvent {
  type: 'state';
  fen: string;
  history: string[];
  turn: Color;
  paused: boolean;
  speedMs: number;
  white: SideConfig;
  black: SideConfig;
  over: boolean;
}

export type ServerEvent = MoveEvent | GameOverEvent | ErrorEvent | StateEvent;

export type ClientMessage =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'speed'; ms: number }
  | { type: 'humanMove'; from: string; to: string; promotion?: string };
