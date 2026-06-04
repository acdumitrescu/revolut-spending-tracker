import { useAppContext } from '../lib/AppContext';
import { getColorForCategory } from '../lib/utils';
import { getCategoryTotals } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';

export default function Categories() {
  const { data, currencySummary } = useAppContext();
  const txns = data.transactions;
  const displayCurrency = data.displayCurrency;
  
  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Categories</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#127919;</div>
          <div className="empty-state-title">No data yet</div>
          <div className="empty-state-desc">Upload a CSV to see spending by category.</div>
        </div>
      </div>
    );
  }

  const catTotals = getCategoryTotals(txns);

  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  if (currencySummary.hasMixedCurrencies) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Categories</h2>
        <MixedCurrencyNotice currencies={currencySummary.currencies} />
      </div>
    );
  }

  if (sortedCats.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Categories</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#128179;</div>
          <div className="empty-state-title">No expense categories found</div>
          <div className="empty-state-desc">Your uploaded data doesn't contain recognizable expense categories yet.</div>
        </div>
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
      <div className="card">
        <div className="card-title">Total Spend by Category</div>
        <ChartWrapper type="bar" data={chartData} height={400} horizontal showLegend={false} currency={displayCurrency} />
      </div>
    </div>
  );
}
