import ChartWrapper from '../ChartWrapper';
import DashboardCard from './DashboardCard';
import UnconvertedNote from './UnconvertedNote';
import { money, prefersReducedMotion, themeColor } from './dashboardFormat';

const INFO = (
  <>
    Running total of spending (debits minus refunds, transfers excluded) day by day. The solid line
    is the chosen period, the dashed line the period right before it, aligned by day number so you
    can see whether you are ahead or behind.
  </>
);

function describeCumulative(series, period, currency) {
  if (series.currentTotal === 0 && series.previousTotal === 0) {
    return 'No spending in this period or the previous one.';
  }
  const index = Math.max(0, Math.min(period.days, series.points.length) - 1);
  const sameDay = series.points[index]?.previous;
  const compared =
    sameDay === null || sameDay === undefined
      ? ''
      : `, against ${money(sameDay, currency)} by day ${index + 1} of the previous period (${money(series.previousTotal, currency)} in total)`;
  return `Cumulative spending reached ${money(series.currentTotal, currency)} by day ${index + 1} of ${period.label.toLowerCase()}${compared}.`;
}

export default function CumulativeSpendCard({ series, period, currency }) {
  const summary = describeCumulative(series, period, currency);
  const empty = series.currentTotal === 0 && series.previousTotal === 0;
  const accent = themeColor('--accent', '#178a82');
  const muted = themeColor('--muted', '#536677');
  const data = {
    labels: series.points.map((point) => point.day),
    datasets: [
      {
        label: period.label,
        data: series.points.map((point) => point.current),
        borderColor: accent,
        backgroundColor: accent,
        borderWidth: 2.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
        spanGaps: false,
      },
      {
        label: 'Previous period',
        data: series.points.map((point) => point.previous),
        borderColor: muted,
        backgroundColor: muted,
        borderWidth: 1.6,
        borderDash: [5, 4],
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.15,
        spanGaps: false,
      },
    ],
  };
  const options = {
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        position: 'bottom',
        // Canvas text cannot read CSS variables: resolve the theme colour so it is legible in dark.
        labels: { padding: 8, color: themeColor('--text-secondary', '#344a59') },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8 }, offset: false },
      y: { ticks: { maxTicksLimit: 4 } },
    },
    ...(prefersReducedMotion() ? { animation: false } : {}),
  };
  return (
    <DashboardCard
      id="cumulative"
      title="Cumulative spend, this period vs previous"
      info={INFO}
      className="dash-chart-card"
    >
      {empty ? (
        <p className="dash-sub">{summary}</p>
      ) : (
        <>
          <ChartWrapper
            type="line"
            data={data}
            height={170}
            currency={currency}
            options={options}
            ariaLabel={`Line chart of cumulative spending. ${summary}`}
          />
          <p className="visually-hidden">{summary}</p>
        </>
      )}
      <UnconvertedNote lists={[series.unconverted, series.previousUnconverted]} />
    </DashboardCard>
  );
}
