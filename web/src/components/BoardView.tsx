import { Chessboard } from 'react-chessboard';
import type { Color } from '../types';

interface Props {
  fen: string;
  humanColor: Color | null;
  onMove: (from: string, to: string, promotion?: string) => void;
}

export function BoardView({ fen, humanColor, onMove }: Props) {
  return (
    <div style={{ width: 'min(70vh, 560px)' }} className="glow">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: humanColor === 'b' ? 'black' : 'white',
          darkSquareStyle: { backgroundColor: 'var(--dark-sq)' },
          lightSquareStyle: { backgroundColor: 'var(--light-sq)' },
          allowDragging: humanColor !== null,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            onMove(sourceSquare, targetSquare, 'q');
            return true; // optimistic; server validates and broadcasts truth
          },
        }}
      />
    </div>
  );
}
