import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import GlobalSearch from '../components/GlobalSearch';
import UtilityMenu from '../components/UtilityMenu';
import SideNavigation from '../components/SideNavigation';

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      transactions: [{
        id: 'one',
        date: '2026-05-10',
        desc: 'Synthetic Market',
        matchedVendor: 'Synthetic Market',
        cat: 'Groceries',
        sub: 'Supermarket',
      }],
    },
  }),
}));

describe('navigation accessibility', () => {
  it('supports arrow and enter navigation in global search', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <GlobalSearch />
        <Routes>
          <Route path="/app/activity/transactions" element={<h1>Transaction results</h1>} />
        </Routes>
      </MemoryRouter>
    );

    const search = screen.getByRole('combobox', { name: /search transactions/i });
    fireEvent.change(search, { target: { value: 'synthetic' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Transaction results' })).toBeInTheDocument();
  });

  it('closes the utility menu with Escape and restores trigger focus', () => {
    render(<MemoryRouter><UtilityMenu /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: /open workspace menu/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('exposes Portfolio and Mappings from the expanded desktop navigation', () => {
    render(<MemoryRouter initialEntries={['/app']}><SideNavigation /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('href', '/app/accounts/portfolio');
    expect(screen.getByRole('link', { name: 'Mappings' })).toHaveAttribute('href', '/app/insights/vendors#mappings');
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
  });
});
