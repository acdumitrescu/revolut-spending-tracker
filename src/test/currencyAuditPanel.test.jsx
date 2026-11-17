import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CurrencyAuditPanel from '../components/CurrencyAuditPanel';

const data = {
  importMeta: {
    history: [
      {
        batchId: 'b1',
        detectedProfileId: 'revolut-business-transaction',
        detectedProfileLabel: 'Revolut Business transaction statement',
        fileName: 'synthetic-business.csv',
        importedAt: Date.UTC(2026, 2, 5),
        status: 'active',
      },
    ],
  },
  transactions: [
    {
      date: '2026-03-01',
      desc: 'Synthetic Cafe',
      amt: -12.5,
      flow: 'Debit',
      type: 'Card Payment',
      ym: '2026-03',
      cat: 'Food & Dining',
      sub: '',
      currency: 'EUR',
      importBatchId: 'b1',
      amountSource: 'amount',
      currencySource: 'currency_payment',
    },
  ],
};

describe('CurrencyAuditPanel', () => {
  it('shows a suspect batch with the mixed row and a link to review it', () => {
    render(
      <MemoryRouter>
        <CurrencyAuditPanel data={data} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Mixed columns')).toBeInTheDocument();
    expect(
      screen.getByText(/amount from Amount, currency from Payment currency/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review on Transactions' })).toHaveAttribute(
      'href',
      '/app/activity/transactions?q=Synthetic%20Cafe',
    );
  });

  it('renders nothing without multi-column imports', () => {
    const { container } = render(
      <MemoryRouter>
        <CurrencyAuditPanel data={{ transactions: [], importMeta: { history: [] } }} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
