import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../lib/AppContext';
import CarLease from '../pages/CarLease';

describe('car lease page', () => {
  it('simulates, saves a car link, reloads it and feeds its price back into the simulator', async () => {
    const values = new Map();
    vi.mocked(localStorage.getItem).mockImplementation(key => values.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => values.set(key, value));
    let view = render(<AppProvider><CarLease /></AppProvider>);

    expect(screen.getByText('No saved cars yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Financing type'), { target: { value: 'cash' } });
    expect(screen.getByLabelText(/Car price/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Annual interest rate/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Financing type'), { target: { value: 'operational' } });
    expect(screen.getByLabelText(/Monthly fee/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add car' }));
    fireEvent.change(screen.getByLabelText('Car name'), { target: { value: 'Synthetic hatchback' } });
    fireEvent.change(screen.getByLabelText('Listing link'), { target: { value: 'https://example.com/listing/42' } });
    fireEvent.change(screen.getByLabelText('Asking price (EUR)'), { target: { value: '18500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save car' }));

    const link = screen.getByRole('link', { name: 'Open listing for Synthetic hatchback' });
    expect(link).toHaveAttribute('href', 'https://example.com/listing/42');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await waitFor(() => expect([...values.values()].some(value => value.includes('Synthetic hatchback'))).toBe(true));
    view.unmount();

    view = render(<AppProvider><CarLease /></AppProvider>);
    expect(screen.getByText('Synthetic hatchback')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Financing type'), { target: { value: 'financial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Synthetic hatchback price in simulator' }));
    expect(screen.getByLabelText(/Car price/)).toHaveValue(18500);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Synthetic hatchback' }));
    expect(screen.getByText('No saved cars yet.')).toBeInTheDocument();
    view.unmount();
  });
});

describe('car lease budget slider', () => {
  it('shows the maximum price for a budget and applies it to the simulator', () => {
    render(<AppProvider><CarLease /></AppProvider>);
    const slider = screen.getByLabelText(/Total monthly car budget/);
    expect(slider).toHaveAttribute('type', 'range');
    fireEvent.change(slider, { target: { value: '3000' } });
    const before = screen.getByText('Maximum car price').nextSibling.textContent;
    fireEvent.change(slider, { target: { value: '4000' } });
    const after = screen.getByText('Maximum car price').nextSibling.textContent;
    expect(Number(after.replace(/\D/g, ''))).toBeGreaterThan(Number(before.replace(/\D/g, '')));
    fireEvent.click(screen.getByRole('button', { name: 'Use max price in simulator' }));
    expect(Number(screen.getByLabelText(/Car price/).value)).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Financing type'), { target: { value: 'cash' } });
    expect(screen.getByText(/For a cash purchase/)).toBeInTheDocument();
  });
});
