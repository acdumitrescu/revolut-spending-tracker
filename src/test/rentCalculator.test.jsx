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
    expect(screen.getByLabelText(/Net monthly income/i)).toHaveValue(0); // starts blank
    for (const [label, value] of [
      [/Net monthly income/i, '9000'],
      [/Monthly rent/i, '550'],
      [/Utilities/i, '600'],
      [/Other fixed commitments/i, '1000'],
      [/Target monthly savings/i, '20'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
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
