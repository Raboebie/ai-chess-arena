import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoveList } from './MoveList';

describe('MoveList', () => {
  it('renders moves paired by number', () => {
    render(
      <MoveList
        history={[
          { san: 'e4', color: 'w', fallback: false, timestamp: 1717322000000, durationMs: 6200 },
          { san: 'e5', color: 'b', fallback: false, timestamp: 1717322007000, durationMs: 5100 },
          { san: 'Nf3', color: 'w', fallback: false, timestamp: 1717322013000, durationMs: 4300 },
        ]}
      />,
    );
    expect(screen.getByText('e4')).toBeInTheDocument();
    expect(screen.getByText('Nf3')).toBeInTheDocument();
    expect(screen.getByText(/1\./)).toBeInTheDocument();
    expect(screen.getByText(/6\.2s/)).toBeInTheDocument();
  });
});
