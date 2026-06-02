import { useEffect, useReducer, useRef, useCallback } from 'react';
import type { ServerEvent, ClientMessage, Color } from './types';

export interface HistoryEntry {
  san: string;
  color: Color;
  comment?: string;
  fallback: boolean;
  timestamp: number;
  durationMs: number;
}

export interface GameState {
  fen: string;
  history: HistoryEntry[];
  over: boolean;
  result?: string;
  reason?: string;
  error?: string;
  pgn?: string;
}

export const initialGameState: GameState = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  history: [],
  over: false,
};

export function gameReducer(state: GameState, ev: ServerEvent): GameState {
  switch (ev.type) {
    case 'state':
      return { ...state, fen: ev.fen, over: ev.over };
    case 'move':
      return {
        ...state,
        fen: ev.fen,
        history: [
          ...state.history,
          {
            san: ev.san,
            color: ev.color,
            comment: ev.comment,
            fallback: ev.fallback,
            timestamp: ev.timestamp,
            durationMs: ev.durationMs,
          },
        ],
      };
    case 'gameover':
      return { ...state, over: true, result: ev.result, reason: ev.reason, pgn: ev.pgn };
    case 'error':
      return { ...state, error: ev.message };
    default:
      return state;
  }
}

export function useGameSocket() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (e) => dispatch(JSON.parse(e.data) as ServerEvent);
    return () => ws.close();
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return { state, send };
}
