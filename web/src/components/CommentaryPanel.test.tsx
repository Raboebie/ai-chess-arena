import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommentaryPanel } from './CommentaryPanel';

const history = [
  { san: 'e4', color: 'w' as const, comment: 'Center control.', fallback: false },
  { san: 'c5', color: 'b' as const, comment: 'Sicilian!', fallback: false },
];

describe('CommentaryPanel', () => {
  it('shows commentary by default', () => {
    render(<CommentaryPanel history={history} />);
    expect(screen.getByText(/Center control/)).toBeInTheDocument();
  });

  it('hides commentary when toggled off', () => {
    render(<CommentaryPanel history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /off/i }));
    expect(screen.queryByText(/Center control/)).not.toBeInTheDocument();
  });
});
