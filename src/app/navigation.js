import {
  ChartNoAxesCombined,
  CircleGauge,
  Landmark,
  ListChecks,
  Target,
} from 'lucide-react';

export const APP_HUBS = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Your financial position and the next useful action.',
    to: '/app',
    icon: CircleGauge,
    matchPaths: ['/app'],
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Review transactions, months, and repeating charges.',
    to: '/app/activity/transactions',
    icon: ListChecks,
    matchPaths: ['/app/activity'],
    children: [
      { id: 'transactions', label: 'Transactions', to: '/app/activity/transactions' },
      { id: 'monthly', label: 'Monthly', to: '/app/activity/monthly' },
      { id: 'recurring', label: 'Recurring', to: '/app/activity/recurring' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Set limits, targets, and forward-looking assumptions.',
    to: '/app/planning/budget',
    icon: Target,
    matchPaths: ['/app/planning'],
    children: [
      { id: 'budget', label: 'Budget', to: '/app/planning/budget' },
      { id: 'goals', label: 'Goals', to: '/app/planning/goals' },
      { id: 'forecast', label: 'Forecast', to: '/app/planning/forecast' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Understand categories, vendors, and spending rhythms.',
    to: '/app/insights/categories',
    icon: ChartNoAxesCombined,
    matchPaths: ['/app/insights'],
    children: [
      { id: 'categories', label: 'Categories', to: '/app/insights/categories' },
      { id: 'vendors', label: 'Vendors', to: '/app/insights/vendors' },
      { id: 'heatmap', label: 'Heatmap', to: '/app/insights/heatmap' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Track balances and account currencies separately.',
    to: '/app/accounts',
    icon: Landmark,
    matchPaths: ['/app/accounts'],
  },
];

export const LEGACY_APP_ROUTES = {
  monthly: '/app/activity/monthly',
  categories: '/app/insights/categories',
  vendors: '/app/insights/vendors',
  transactions: '/app/activity/transactions',
  budget: '/app/planning/budget',
  heatmap: '/app/insights/heatmap',
  forecast: '/app/planning/forecast',
  goals: '/app/planning/goals',
  recurring: '/app/activity/recurring',
};

export function getActiveHub(pathname) {
  return APP_HUBS.find((hub) => hub.matchPaths.some((path) => (
    path === '/app' ? pathname === path : pathname.startsWith(path)
  ))) || null;
}
