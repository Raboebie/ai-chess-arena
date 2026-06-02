import { useState } from 'react';
import type { ClientMessage } from '../types';

interface Props {
  send: (m: ClientMessage) => void;
  onNewGame: () => void;
  over: boolean;
  result?: string;
  reason?: string;
}

export function Controls({ send, onNewGame, over, result, reason }: Props) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1500);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        marginTop: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            send({ type: 'pause' });
            setPaused(true);
          }}
        >
          ⏸ Pause
        </button>
        <button
          className="primary"
          onClick={() => {
            send({ type: 'play' });
            setPaused(false);
          }}
        >
          ▶ Play
        </button>
        <button onClick={() => send({ type: 'step' })} disabled={!paused}>
          ⏭ Step
        </button>
        <button onClick={onNewGame}>＋ New</button>
        <button
          onClick={() => {
            window.location.href = '/api/games/current/pgn';
          }}
        >
          ⬇ PGN
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Speed</span>
        <input
          type="range"
          min={0}
          max={4000}
          step={250}
          value={speed}
          onChange={(e) => {
            const ms = Number(e.target.value);
            setSpeed(ms);
            send({ type: 'speed', ms });
          }}
        />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{(speed / 1000).toFixed(2)}s</span>
      </div>
      {over && (
        <div className="title">
          Game over — {result} ({reason})
        </div>
      )}
    </div>
  );
}
