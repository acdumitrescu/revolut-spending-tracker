import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RentCalculator from '../pages/RentCalculator';

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      fxRates: {
        EUR: 5.25,
      },
    },
  }),
}));

describe('RentCalculator', () => {
  it('uses the saved EUR rate and recalculates when income changes', () => {
    render(<RentCalculator />);

    expect(screen.getByLabelText(/EUR exchange rate/i)).toHaveValue(5.25);
    expect(screen.getByText('38.8% of income')).toBeInTheDocument();
    expect(screen.getByText('Stretched')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Net monthly income/i), {
      target: { value: '12000' },
    });

    expect(screen.getByText('29.1% of income')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('€571')).toBeInTheDocument();
  });
});
