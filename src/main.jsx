import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

// High-Visibility Chart.js Defaults for Grey Theme
ChartJS.defaults.color = '#333333'; // Dark text for labels
ChartJS.defaults.font.family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
ChartJS.defaults.font.size = 12;
ChartJS.defaults.font.weight = '500';
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
ChartJS.defaults.plugins.legend.labels.pointStyle = 'circle';
ChartJS.defaults.plugins.legend.labels.padding = 16;
ChartJS.defaults.plugins.tooltip.backgroundColor = '#000000';
ChartJS.defaults.plugins.tooltip.titleColor = '#FFFFFF';
ChartJS.defaults.plugins.tooltip.bodyColor = '#FFFFFF';
ChartJS.defaults.plugins.tooltip.borderColor = 'rgba(0, 0, 0, 0.1)';
ChartJS.defaults.plugins.tooltip.borderWidth = 0;
ChartJS.defaults.plugins.tooltip.cornerRadius = 8;
ChartJS.defaults.plugins.tooltip.padding = 12;
ChartJS.defaults.plugins.tooltip.displayColors = true;
ChartJS.defaults.scale.grid = {
  color: 'rgba(0, 0, 0, 0.08)', // More visible grid lines
  drawBorder: false,
};
ChartJS.defaults.scale.ticks = {
  padding: 8,
  color: '#333333', // Dark ticks
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
