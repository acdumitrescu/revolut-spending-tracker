import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatCurrencyK } from '../lib/utils';

const CHART_COMPONENTS = {
  bar: Bar,
  line: Line,
  doughnut: Doughnut,
};

function getThemeValue(token, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

const DEFAULT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  resizeDelay: 0,
  layout: {
    padding: {
      top: 4,
      left: 4,
      right: 6,
      bottom: 0,
    },
  },
  plugins: {
    legend: {
      labels: {
        color: '#333333',
        font: { size: 11, weight: '600' },
        padding: 14,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: '#000000',
      titleColor: '#FFFFFF',
      bodyColor: '#FFFFFF',
      cornerRadius: 12,
      padding: 12,
    },
  },
};

const DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right',
      labels: { color: '#333333', font: { size: 11, weight: '600' }, padding: 12, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
    },
  },
  cutout: '68%',
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
  const textColor = getThemeValue('--text', '#111827');
  const mutedColor = getThemeValue('--muted', '#6f7d93');
  const borderColor = getThemeValue('--border', 'rgba(72, 50, 24, 0.09)');
  const surfaceColor = getThemeValue('--surface-elevated', '#ffffff');
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
          backgroundColor: surfaceColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor,
          borderWidth: 1,
          callbacks: {
            label: (context) => `${context.label}: ${formatCurrency(context.parsed, currency)}`,
          },
          ...(options.plugins?.tooltip || {}),
        },
        legend: {
          ...DOUGHNUT_OPTIONS.plugins.legend,
          labels: {
            ...DOUGHNUT_OPTIONS.plugins.legend.labels,
            color: textColor,
          },
          ...(options.plugins?.legend || {}),
          display: showLegend,
        },
      },
    };
  } else {
    const verticalScales = {
      x: {
        type: 'category',
        offset: true,
        ticks: {
          color: mutedColor,
          font: { size: 10 },
          maxRotation: 0,
          autoSkipPadding: 10,
        },
        grid: {
          display: false,
        },
      },
      y: {
        type: 'linear',
        beginAtZero: true,
        ticks: {
          color: mutedColor,
          font: { size: 10 },
          callback: (value) => formatCurrencyK(Number(value), currency),
        },
        grid: {
          color: borderColor,
          drawBorder: false,
          tickLength: 0,
        },
      },
    };

    const horizontalScales = {
      x: {
        type: 'linear',
        beginAtZero: true,
        ticks: {
          color: mutedColor,
          font: { size: 10 },
          callback: (value) => formatCurrencyK(Number(value), currency),
        },
        grid: {
          color: borderColor,
          drawBorder: false,
          tickLength: 0,
        },
      },
      y: {
        type: 'category',
        offset: true,
        ticks: {
          color: mutedColor,
          font: { size: 10 },
        },
        grid: {
          display: false,
        },
      },
    };

    mergedOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      indexAxis: horizontal ? 'y' : options.indexAxis,
      plugins: {
        ...DEFAULT_OPTIONS.plugins,
        ...(options.plugins || {}),
        tooltip: {
          ...DEFAULT_OPTIONS.plugins.tooltip,
          backgroundColor: surfaceColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor,
          borderWidth: 1,
          callbacks: {
            label: (context) => `${context.dataset.label || 'Value'}: ${formatCurrency(context.parsed.x ?? context.parsed.y ?? context.raw, currency)}`,
          },
          ...(options.plugins?.tooltip || {}),
        },
        legend: {
          ...DEFAULT_OPTIONS.plugins.legend,
          labels: {
            ...DEFAULT_OPTIONS.plugins.legend.labels,
            color: textColor,
          },
          ...(options.plugins?.legend || {}),
          display: showLegend,
        },
      },
      scales: horizontal
        ? {
            x: {
              ...horizontalScales.x,
              ...(options.scales?.x || {}),
              ticks: {
                ...horizontalScales.x.ticks,
                ...(options.scales?.x?.ticks || {}),
              },
              grid: {
                ...horizontalScales.x.grid,
                ...(options.scales?.x?.grid || {}),
              },
            },
            y: {
              ...horizontalScales.y,
              ...(options.scales?.y || {}),
              ticks: {
                ...horizontalScales.y.ticks,
                ...(options.scales?.y?.ticks || {}),
              },
              grid: {
                ...horizontalScales.y.grid,
                ...(options.scales?.y?.grid || {}),
              },
            },
          }
        : {
            x: {
              ...verticalScales.x,
              ...(options.scales?.x || {}),
              ticks: {
                ...verticalScales.x.ticks,
                ...(options.scales?.x?.ticks || {}),
              },
              grid: {
                ...verticalScales.x.grid,
                ...(options.scales?.x?.grid || {}),
              },
            },
            y: {
              ...verticalScales.y,
              ...(options.scales?.y || {}),
              ticks: {
                ...verticalScales.y.ticks,
                ...(options.scales?.y?.ticks || {}),
              },
              grid: {
                ...verticalScales.y.grid,
                ...(options.scales?.y?.grid || {}),
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
