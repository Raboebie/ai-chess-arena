import type { HistoryEntry } from '../useGameSocket';

export function MoveList({ history }: { history: HistoryEntry[] }) {
  const rows: { n: number; white?: HistoryEntry; black?: HistoryEntry }[] = [];
  history.forEach((entry, i) => {
    const n = Math.floor(i / 2);
    rows[n] ??= { n: n + 1 };
    if (entry.color === 'w') rows[n].white = entry;
    else rows[n].black = entry;
  });

  return (
    <div>
      <h3 className="panel-h">Moves</h3>
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td style={{ color: 'var(--muted)', width: 28 }}>{r.n}.</td>
              <td title={r.white ? new Date(r.white.timestamp).toLocaleTimeString() : undefined}>
                {r.white && (
                  <span style={{ color: r.white.fallback ? '#ffb4b4' : 'inherit' }}>
                    {r.white.san}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {(r.white.durationMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                )}
              </td>
              <td title={r.black ? new Date(r.black.timestamp).toLocaleTimeString() : undefined}>
                {r.black && (
                  <span style={{ color: r.black.fallback ? '#ffb4b4' : 'inherit' }}>
                    {r.black.san}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {(r.black.durationMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
