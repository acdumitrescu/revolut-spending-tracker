import React from 'react';
import ReactDOM from 'react-dom/client';
import Chart from 'chart.js/auto';
import App from './App';
import './index.css';

// High-Visibility Chart.js Defaults for Grey Theme
Chart.defaults.color = '#333333'; // Dark text for labels
Chart.defaults.font.family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.font.weight = '500';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = '#000000';
Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
Chart.defaults.plugins.tooltip.bodyColor = '#FFFFFF';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(0, 0, 0, 0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 0;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.scale.grid = {
  color: 'rgba(0, 0, 0, 0.08)', // More visible grid lines
  drawBorder: false,
};
Chart.defaults.scale.ticks = {
  padding: 8,
  color: '#333333', // Dark ticks
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
