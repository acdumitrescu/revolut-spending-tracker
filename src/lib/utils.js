export const formatCurrency = (value) => {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatCurrencyK = (value) => {
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
  return Math.round(value).toString();
};

export const formatPercentage = (value, total) => {
  if (!total) return '0%';
  return ((value / total) * 100).toFixed(1) + '%';
};

export const CAT_COLORS = {
  'Shopping': '#007AFF',       // iOS Blue
  'Groceries': '#34C759',      // iOS Green
  'Health': '#FF3B30',         // iOS Red
  'Transport': '#AF52DE',      // iOS Purple
  'Food & Dining': '#FF9500',  // iOS Orange
  'Telecom': '#5AC8FA',        // iOS Light Blue
  'Subscriptions': '#30D158',  // iOS Mint
  'Tech & Cloud': '#8E8E93',   // iOS Gray
  'Sports & Fitness': '#32D74B',// iOS Bright Green
  'Entertainment': '#FF2D55',  // iOS Pink
  'Personal Care': '#BF5AF2',  // iOS Violet
  'Education': '#0A84FF',      // iOS Bright Blue
  'Utilities': '#636366',      // iOS Dark Gray
  'Gambling': '#FF453A',       // iOS Bright Red
  'Cash': '#AEAEB2',           // iOS Medium Gray
  'Travel': '#007AFF',         // iOS Blue
  'Fees': '#C7C7CC',           // iOS Light Gray
  'Other': '#8E8E93',          // iOS Gray
  'Income': '#34C759',         // iOS Green
  'Transfers': '#636366',      // iOS Dark Gray
  'Savings': '#007AFF'         // iOS Blue
};

export const EXPENSE_CATS = new Set([
  'Groceries', 'Food & Dining', 'Transport', 'Telecom',
  'Entertainment', 'Gambling', 'Health', 'Personal Care', 'Sports & Fitness', 'Shopping',
  'Subscriptions', 'Tech & Cloud', 'Education', 'Utilities', 'Travel', 'Cash', 'Fees', 'Other'
]);

export const getColorForCategory = (cat) => {
  return CAT_COLORS[cat] || '#64748B';
};
