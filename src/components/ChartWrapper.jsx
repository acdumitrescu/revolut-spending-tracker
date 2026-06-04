import { Bar, Line, Doughnut } from 'react-chartjs-2';

const CHART_COMPONENTS = {
  bar: Bar,
  line: Line,
  doughnut: Doughnut,
};

const DEFAULT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
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
      ticks: { color: '#333333', font: { size: 11 } },
      grid: { color: 'rgba(0, 0, 0, 0.08)', drawBorder: false },
    },
    y: {
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
}) {
  const Component = CHART_COMPONENTS[type];
  if (!Component) {
    console.error(`ChartWrapper: unknown chart type "${type}"`);
    return null;
  }

  let mergedOptions;
  if (type === 'doughnut') {
    mergedOptions = {
      ...DOUGHNUT_OPTIONS,
      ...options,
      plugins: {
        ...DOUGHNUT_OPTIONS.plugins,
        ...(options.plugins || {}),
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
          },
    };
  }

  return (
    <div style={{ height: `${height}px`, position: 'relative', width: '100%' }}>
      <Component data={data} options={mergedOptions} />
    </div>
  );
}
