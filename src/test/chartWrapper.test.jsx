import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChartWrapper from '../components/ChartWrapper';
import { formatCurrency } from '../lib/utils';

const { chart } = vi.hoisted(() => ({ chart: vi.fn(() => null) }));
vi.mock('react-chartjs-2', () => ({ Bar: chart, Line: chart, Doughnut: chart }));

const data = { labels: ['Jan', 'Feb'], datasets: [{ label: 'Expenses', data: [0, 8123.45] }] };
function optionsFor(props) {
  render(<ChartWrapper data={data} {...props} />);
  return chart.mock.lastCall[0].options;
}

describe('chart monetary tooltips', () => {
  it.each(['bar', 'line'])(
    'uses the value, not the category index, for vertical %s charts',
    (type) => {
      const options = optionsFor({ type });
      for (const amount of [8123.45, 0, -2799.53]) {
        expect(
          options.plugins.tooltip.callbacks.label({
            dataset: data.datasets[0],
            parsed: { x: 1, y: amount },
          }),
        ).toBe(`Expenses: ${formatCurrency(amount, 'RON')}`);
      }
    },
  );

  it.each([{ horizontal: true }, { options: { indexAxis: 'y' } }])(
    'uses x values for horizontal charts configured with %j',
    (props) => {
      const options = optionsFor({ type: 'bar', currency: 'EUR', ...props });
      expect(options.scales.x.type).toBe('linear');
      expect(options.scales.y.type).toBe('category');
      expect(
        options.plugins.tooltip.callbacks.label({
          dataset: data.datasets[0],
          parsed: { x: 8123.45, y: 1 },
        }),
      ).toBe(`Expenses: ${formatCurrency(8123.45, 'EUR')}`);
    },
  );

  it('preserves doughnut values and caller-defined tooltip callbacks', () => {
    const doughnut = optionsFor({ type: 'doughnut' });
    expect(doughnut.plugins.tooltip.callbacks.label({ label: 'Expenses', parsed: 8123.45 })).toBe(
      `Expenses: ${formatCurrency(8123.45, 'RON')}`,
    );
    const label = () => 'Custom tooltip';
    const custom = optionsFor({
      type: 'bar',
      options: { plugins: { tooltip: { callbacks: { label } } } },
    });
    expect(custom.plugins.tooltip.callbacks.label).toBe(label);
  });
});
