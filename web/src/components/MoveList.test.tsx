import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoveList } from './MoveList';

describe('MoveList', () => {
  it('renders moves paired by number', () => {
    render(
      <MoveList
        history={[
          { san: 'e4', color: 'w', fallback: false },
          { san: 'e5', color: 'b', fallback: false },
          { san: 'Nf3', color: 'w', fallback: false },
        ]}
      />,
    );
    expect(screen.getByText('e4')).toBeInTheDocument();
    expect(screen.getByText('Nf3')).toBeInTheDocument();
    expect(screen.getByText(/1\./)).toBeInTheDocument();
  });
});
