import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import LandingPage from '../pages/LandingPage';

describe('LandingPage', () => {
  it('renders the local-first positioning and import path', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /know where your money goes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import your csv/i })).toHaveAttribute('href', '/app/import');
    expect(screen.getByText(/no account required/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /useful dashboard in three quiet steps/i })).toBeInTheDocument();
    expect(screen.getByText(/optional private sync is designed for self-hosted deployments/i)).toBeInTheDocument();
  });
});
