import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Overview from '../pages/Overview';
import { formatCurrency } from '../lib/utils';

const state = vi.hoisted(() => ({ data: null }));

vi.mock('../components/ChartWrapper', () => ({
  default: ({ type, data, ariaLabel }) => (
    <div
      data-testid={`chart-${type}`}
      data-aria={ariaLabel}
      data-series={JSON.stringify(data?.datasets?.map((dataset) => dataset.label))}
    />
  ),
}));

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({ data: state.data }),
}));

// Synthetic workspace. "Today" is fixed to 2026-11-16 so nothing depends on the real date.
const txn = (date, amt, cat, extra = {}) => ({
  date,
  desc: `Synthetic ${cat}`,
  cat,
  sub: '',
  amt,
  flow: amt < 0 ? 'Debit' : 'Credit',
  type: 'CARD',
  ym: date.slice(0, 7),
  currency: 'RON',
  source: 'revolut',
  ...extra,
});

const workspace = (overrides = {}) => ({
  transactions: [
    txn('2026-11-03', -400, 'Groceries'),
    txn('2026-11-10', -100, 'Food & Dining'),
    txn('2026-10-03', -300, 'Groceries'),
    txn('2026-10-20', -200, 'Groceries'),
  ],
  accounts: [
    {
      id: 'account-1',
      name: 'Savings',
      currency: 'RON',
      balances: { '2026-09': 1000, '2026-10': 1200, '2026-11': 1500 },
      notes: {},
    },
  ],
  budgets: { '2026-11': { Groceries: 600 } },
  subscriptions: [
    {
      id: 'sub-1',
      name: 'Synthetic Stream',
      amount: 12.5,
      currency: 'RON',
      cycle: 'monthly',
      nextRenewal: '2026-11-20',
      status: 'active',
      icon: '',
      notes: '',
    },
  ],
  goals: [],
  creditRecords: [],
  displayCurrency: 'RON',
  fxRates: { EUR: 5, USD: 4.6 },
  ...overrides,
});

// An "Other" debit makes the Needs attention card appear.
const withUncategorised = (data) => ({
  ...data,
  transactions: [...data.transactions, txn('2026-11-05', -50, 'Other')],
});

// Whitespace is normalised by Testing Library, so build expected text the same way.
const money = (value, currency = 'RON', decimals = 0) =>
  formatCurrency(value, currency, { decimals }).replace(/\s+/g, ' ');

const region = (name) => screen.getByRole('region', { name });

function renderPage() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
}

describe('Overview dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0));
    state.data = withUncategorised(workspace());
  });
  afterEach(() => vi.useRealTimers());

  it('shows one h1 and the headline cards with numbers from the workspace', () => {
    renderPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();

    const netWorth = within(region('Net worth'));
    expect(netWorth.getByText(money(1500))).toBeInTheDocument();
    expect(
      netWorth.getByText(new RegExp(`Up ${money(300)} \\(25.0%\\) vs 2026-10`)),
    ).toBeInTheDocument();

    const spent = within(region(/^Spent/));
    expect(spent.getByText(money(550))).toBeInTheDocument();
    expect(region(/^Spent/)).toHaveTextContent(`${money(550)} of ${money(600)} budget`);
    expect(spent.getByRole('progressbar', { name: 'Spent against budget' })).toHaveAttribute(
      'aria-valuenow',
      '92',
    );

    const left = within(region('Left in budget'));
    expect(left.getByText(money(200))).toBeInTheDocument();

    expect(region(/^Cumulative spend/)).toBeInTheDocument();
    expect(region('Top 5 categories')).toHaveTextContent('Groceries');
    expect(region('Top 5 categories')).toHaveTextContent(`${money(400)} · 73%`);
  });

  it('lists what is coming up with date and exact amount, and links to subscriptions', () => {
    renderPage();
    const coming = region(/^Coming up/);
    expect(coming).toHaveTextContent('Synthetic Stream');
    expect(coming).toHaveTextContent('Nov 20');
    expect(coming).toHaveTextContent(money(12.5, 'RON', 2));
    expect(within(coming).getByRole('link', { name: 'All subscriptions' })).toHaveAttribute(
      'href',
      '/app/activity/subscriptions',
    );
  });

  it('shows a friendly empty state in Coming up when nothing is due', () => {
    state.data = workspace({ subscriptions: [] });
    renderPage();
    expect(region(/^Coming up/)).toHaveTextContent('Nothing due in the next 14 days.');
  });

  it('one period picker changes every card', () => {
    renderPage();
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), {
      target: { value: 'last-month' },
    });

    expect(screen.getByText('2026-10-01 to 2026-10-31')).toBeInTheDocument();
    expect(within(region('Net worth')).getByText(money(1200))).toBeInTheDocument();
    expect(region(/^Spent · Last month/)).toHaveTextContent(money(500));
    // October has no budget: the budget cards say so instead of showing zero.
    expect(region(/^Spent/)).toHaveTextContent('No budget for this period');
    expect(region('Left in budget')).toHaveTextContent('No budget set for this period');
    expect(region('Top 5 categories')).toHaveTextContent(`${money(500)} · 100%`);
    expect(screen.getByTestId('chart-line')).toHaveAttribute(
      'data-series',
      JSON.stringify(['Last month', 'Previous period']),
    );
  });

  it('says over budget in words, not only in colour', () => {
    state.data = workspace({ budgets: { '2026-11': { Groceries: 300 } } });
    renderPage();
    expect(region(/^Spent/)).toHaveTextContent(`${money(200)} over budget`);
    expect(region('Left in budget')).toHaveTextContent(`${money(100)} over`);
  });

  it('gives the cumulative chart a text alternative', () => {
    renderPage();
    const chart = screen.getByTestId('chart-line');
    expect(chart.getAttribute('data-aria')).toMatch(/Cumulative spending reached/);
    expect(region(/^Cumulative spend/)).toHaveTextContent(
      `Cumulative spending reached ${money(550)} by day 16 of this month`,
    );
  });

  it('shows a visible note when amounts have no exchange rate', () => {
    state.data = withUncategorised(workspace());
    state.data.transactions.push(txn('2026-11-06', -80, 'Groceries', { currency: 'GBP' }));
    renderPage();
    expect(region(/^Spent/)).toHaveTextContent(/Excludes .*GBP: no exchange rate/);
    expect(region('Top 5 categories')).toHaveTextContent(/Excludes .*GBP: no exchange rate/);
    expect(region(/^Cumulative spend/)).toHaveTextContent(/Excludes .*GBP: no exchange rate/);
  });

  it('links each attention item to the page that fixes it', () => {
    renderPage();
    const attention = within(region('Needs attention'));
    expect(attention.getByRole('link', { name: '1 transaction still in Other' })).toHaveAttribute(
      'href',
      '/app/insights/vendors#mappings',
    );
  });

  it('hides Needs attention when there is nothing to do', () => {
    state.data = workspace();
    renderPage();
    expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });

  it('shows an import prompt instead of zeros for an empty workspace', () => {
    state.data = workspace({ transactions: [], accounts: [], subscriptions: [], budgets: {} });
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nothing to show yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import transactions' })).toHaveAttribute(
      'href',
      '/app/import',
    );
    expect(screen.queryByRole('region', { name: 'Net worth' })).not.toBeInTheDocument();
  });

  it('explains each card in one info popover instead of note paragraphs', () => {
    const { container } = renderPage();
    expect(container.querySelector('.section-note')).toBeNull();

    const button = screen.getByRole('button', { name: 'About Net worth' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    expect(panel).toBeInTheDocument();
    expect(panel).not.toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
