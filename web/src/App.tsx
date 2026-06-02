import { useState } from 'react';
import './theme.css';
import { useGameSocket } from './useGameSocket';
import { BoardView } from './components/BoardView';
import { MoveList } from './components/MoveList';
import { CommentaryPanel } from './components/CommentaryPanel';
import { Controls } from './components/Controls';
import { SetupModal } from './components/SetupModal';
import type { NewGameRequest } from './types';

export default function App() {
  const { state, send } = useGameSocket();
  const [setupOpen, setSetupOpen] = useState(true);
  const [humanColor, setHumanColor] = useState<'w' | 'b' | null>(null);

  async function startGame(req: NewGameRequest) {
    await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    setHumanColor(req.white.kind === 'human' ? 'w' : req.black.kind === 'human' ? 'b' : null);
    setSetupOpen(false);
  }

  return (
    <div className="app">
      <div className="col">
        <div className="title">♟ AI Chess Arena</div>
        {state.error && <div className="banner">{state.error}</div>}
        <MoveList history={state.history} />
      </div>

      <div className="col center">
        <BoardView
          fen={state.fen}
          humanColor={humanColor}
          onMove={(from, to, promotion) => send({ type: 'humanMove', from, to, promotion })}
        />
        <Controls
          send={send}
          onNewGame={() => setSetupOpen(true)}
          over={state.over}
          result={state.result}
          reason={state.reason}
        />
      </div>

      <div className="col">
        <CommentaryPanel history={state.history} />
      </div>

      {setupOpen && <SetupModal onStart={startGame} onClose={() => setSetupOpen(false)} />}
    </div>
  );
}
