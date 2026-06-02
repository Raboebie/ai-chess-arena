import { useState } from 'react';
import type { HistoryEntry } from '../useGameSocket';

type Mode = 'reasoning' | 'persona' | 'off';

export function CommentaryPanel({ history }: { history: HistoryEntry[] }) {
  const [mode, setMode] = useState<Mode>('reasoning');
  const withComments = history.filter((h) => h.comment);

  return (
    <div>
      <h3 className="panel-h">Commentary</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['reasoning', 'persona', 'off'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'primary' : ''} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>
      {mode !== 'off' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {withComments.map((h, i) => (
            <div
              key={i}
              style={{ background: 'var(--panel-2)', borderRadius: 8, padding: '6px 10px' }}
            >
              <span style={{ color: 'var(--accent)' }}>
                {h.color === 'w' ? 'White' : 'Black'} {h.san}:
              </span>{' '}
              {h.comment}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
