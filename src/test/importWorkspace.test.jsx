import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ImportWorkspace from '../pages/ImportWorkspace';
import { AppProvider } from '../lib/AppContext';
import { ToastProvider } from '../components/Toast';

describe('ImportWorkspace', () => {
  it('offers CSV, demo, and private restore paths', () => {
    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>
    );

    expect(screen.getByRole('heading', { name: /bring your financial history into focus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose csv file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try synthetic demo data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore private backup/i })).toBeInTheDocument();
    expect(screen.getByText(/no bank connection required/i)).toBeInTheDocument();
  });
});
