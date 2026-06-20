import { useAppContext } from '../lib/AppContext';
import { getColorForCategory } from '../lib/utils';
import { getCategoryTotals } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { Tags } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function Categories() {
  const { data, currencySummary } = useAppContext();
  const txns = data.transactions;
  const displayCurrency = data.displayCurrency;
  const selectorOptions = { displayCurrency, fxRates: data.fxRates };
  
  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Categories</h2>
        <EmptyState icon={Tags} title="No category insights yet" description="Import transactions to see how your spending is distributed." />
      </div>
    );
  }

  const catTotals = getCategoryTotals(txns, null, selectorOptions);

  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  if (sortedCats.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Categories</h2>
        <EmptyState icon={Tags} title="No expense categories found" description="The current data does not contain recognizable expense categories." actionLabel="Review vendor mappings" actionTo="/app/insights/vendors" />
      </div>
    );
  }

  const chartData = {
    labels: sortedCats.map(c => c[0]),
    datasets: [{
      label: 'Spend',
      data: sortedCats.map(c => c[1]),
      backgroundColor: sortedCats.map(c => getColorForCategory(c[0])),
      borderColor: '#FFFFFF',
      borderWidth: 2,
      borderRadius: 6,
      barPercentage: 0.7,
    }]
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Categories</h2>
      {currencySummary.hasMixedCurrencies && (
        <div style={{ marginBottom: '20px' }}>
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        </div>
      )}
      <div className="card">
        <div className="card-title">Total Spend by Category</div>
        <ChartWrapper type="bar" data={chartData} height={400} horizontal showLegend={false} currency={displayCurrency} />
      </div>
    </div>
  );
}
