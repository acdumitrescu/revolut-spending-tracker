import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../lib/AppContext';
import { ToastProvider } from '../components/Toast';

vi.mock('../lib/runtimeConfig', () => ({
  isPrivateSyncDeployment: () => true,
  runtimeConfig: {
    deploymentProfile: 'private-sync',
    privateSyncEnabled: true,
    apiBasePath: '/api',
  },
}));

import ImportWorkspace from '../pages/ImportWorkspace';

describe('ImportWorkspace private-sync privacy copy', () => {
  it('states that confirmed app state is copied to the configured private server', () => {
    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>,
    );

    expect(screen.getByText(/how private sync handles data/i)).toBeInTheDocument();
    expect(screen.getAllByText(/copied to your.*private server/i).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/nothing from a csv import is stored on our server/i),
    ).not.toBeInTheDocument();
  });
});
