import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatCurrencyK } from '../lib/utils';

const CHART_COMPONENTS = {
  bar: Bar,
  line: Line,
  doughnut: Doughnut,
};

const DEFAULT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  resizeDelay: 0,
  plugins: {
    legend: {
      labels: { color: '#333333', font: { size: 12, weight: '500' } },
    },
    tooltip: {
      backgroundColor: '#000000',
      titleColor: '#FFFFFF',
      bodyColor: '#FFFFFF',
      cornerRadius: 8,
      padding: 12,
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { color: '#333333', font: { size: 11 } },
      grid: { color: 'rgba(0, 0, 0, 0.08)', drawBorder: false },
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#333333', font: { size: 11 } },
      grid: { color: 'rgba(0, 0, 0, 0.08)', drawBorder: false },
    },
  },
};

const DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right',
      labels: { color: '#333333', font: { size: 12, weight: '500' }, padding: 12 },
    },
  },
  cutout: '60%',
};

export default function ChartWrapper({
  type,
  data,
  options = {},
  height = 300,
  horizontal = false,
  showLegend = true,
  currency = 'RON',
}) {
  const Component = CHART_COMPONENTS[type];
  if (!Component) {
    console.error(`ChartWrapper: unknown chart type "${type}"`);
    return null;
  }

  const labels = Array.isArray(data?.labels) ? data.labels : [];
  const datasets = Array.isArray(data?.datasets) ? data.datasets : [];
  const hasRenderableData = labels.length > 0 && datasets.some((dataset) => Array.isArray(dataset?.data) && dataset.data.length > 0);
  if (!hasRenderableData) {
    return (
      <div style={{ height: `${height}px`, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px', border: '1px dashed var(--border)', borderRadius: '12px' }}>
        No chart data available for this view yet.
      </div>
    );
  }

  let mergedOptions;
  if (type === 'doughnut') {
    mergedOptions = {
      ...DOUGHNUT_OPTIONS,
      ...options,
      plugins: {
        ...DOUGHNUT_OPTIONS.plugins,
        ...(options.plugins || {}),
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${formatCurrency(context.parsed, currency)}`,
          },
          ...(options.plugins?.tooltip || {}),
        },
        legend: {
          ...DOUGHNUT_OPTIONS.plugins.legend,
          ...(options.plugins?.legend || {}),
          display: showLegend,
        },
      },
    };
  } else {
    mergedOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      indexAxis: horizontal ? 'y' : options.indexAxis,
      plugins: {
        ...DEFAULT_OPTIONS.plugins,
        ...(options.plugins || {}),
        tooltip: {
          ...DEFAULT_OPTIONS.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.dataset.label || 'Value'}: ${formatCurrency(context.parsed.x ?? context.parsed.y ?? context.raw, currency)}`,
          },
          ...(options.plugins?.tooltip || {}),
        },
        legend: {
          ...DEFAULT_OPTIONS.plugins.legend,
          ...(options.plugins?.legend || {}),
          display: showLegend,
        },
      },
      scales: horizontal
        ? {
            x: {
              ...DEFAULT_OPTIONS.scales.x,
              ...(options.scales?.x || {}),
              beginAtZero: true,
              ticks: {
                color: '#333333',
                font: { size: 11 },
                callback: (value) => formatCurrencyK(Number(value), currency),
                ...(options.scales?.x?.ticks || {}),
              },
              grid: { color: 'rgba(0, 0, 0, 0.08)', drawBorder: false },
            },
            y: {
              ...DEFAULT_OPTIONS.scales.y,
              ...(options.scales?.y || {}),
              grid: { display: false },
              ticks: { color: '#333333', font: { size: 11 } },
            },
          }
        : {
            ...DEFAULT_OPTIONS.scales,
            ...(options.scales || {}),
            y: {
              ...DEFAULT_OPTIONS.scales.y,
              ...(options.scales?.y || {}),
              beginAtZero: true,
              ticks: {
                color: '#333333',
                font: { size: 11 },
                callback: (value) => formatCurrencyK(Number(value), currency),
                ...(options.scales?.y?.ticks || {}),
              },
            },
          },
    };
  }

  return (
    <div style={{ height: `${height}px`, position: 'relative', width: '100%' }}>
      <Component data={data} options={mergedOptions} />
    </div>
  );
}
