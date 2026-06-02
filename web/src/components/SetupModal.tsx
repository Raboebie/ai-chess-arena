import { useState } from 'react';
import type { NewGameRequest, PlayerKind } from '../types';

const MODELS = ['opus', 'sonnet', 'haiku'];

export function SetupModal({
  onStart,
  onClose,
}: {
  onStart: (r: NewGameRequest) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'cvc' | 'hvc'>('cvc');
  const [humanColor, setHumanColor] = useState<'w' | 'b'>('w');
  const [whiteModel, setWhiteModel] = useState('opus');
  const [blackModel, setBlackModel] = useState('sonnet');
  const [whitePersona, setWhitePersona] = useState('');
  const [blackPersona, setBlackPersona] = useState('');

  function start() {
    const claudeW = {
      kind: 'claude' as PlayerKind,
      model: whiteModel,
      persona: whitePersona || undefined,
    };
    const claudeB = {
      kind: 'claude' as PlayerKind,
      model: blackModel,
      persona: blackPersona || undefined,
    };
    const human = { kind: 'human' as PlayerKind };
    const req: NewGameRequest =
      mode === 'cvc'
        ? { white: claudeW, black: claudeB, speedMs: 1500 }
        : humanColor === 'w'
          ? { white: human, black: claudeB, speedMs: 1500 }
          : { white: claudeW, black: human, speedMs: 1500 };
    onStart(req);
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.6)',
    display: 'grid',
    placeItems: 'center',
  } as const;
  const card = {
    background: 'var(--panel)',
    padding: 24,
    borderRadius: 12,
    width: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as const;

  return (
    <div style={overlay}>
      <div style={card} className="glow">
        <div className="title">New Game</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={mode === 'cvc' ? 'primary' : ''} onClick={() => setMode('cvc')}>
            Claude vs Claude
          </button>
          <button className={mode === 'hvc' ? 'primary' : ''} onClick={() => setMode('hvc')}>
            You vs Claude
          </button>
        </div>

        {mode === 'hvc' && (
          <label>
            You play:{' '}
            <select value={humanColor} onChange={(e) => setHumanColor(e.target.value as 'w' | 'b')}>
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
        )}

        {(mode === 'cvc' || humanColor === 'b') && (
          <Side
            label="White (Claude)"
            model={whiteModel}
            setModel={setWhiteModel}
            persona={whitePersona}
            setPersona={setWhitePersona}
          />
        )}
        {(mode === 'cvc' || humanColor === 'w') && (
          <Side
            label="Black (Claude)"
            model={blackModel}
            setModel={setBlackModel}
            persona={blackPersona}
            setPersona={setBlackPersona}
          />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={start}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

function Side(props: {
  label: string;
  model: string;
  setModel: (s: string) => void;
  persona: string;
  setPersona: (s: string) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--panel-2)',
        padding: 10,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <strong>{props.label}</strong>
      <label>
        Model:{' '}
        <select value={props.model} onChange={(e) => props.setModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <input
        placeholder="Persona (optional), e.g. aggressive attacker"
        value={props.persona}
        onChange={(e) => props.setPersona(e.target.value)}
      />
    </div>
  );
}
