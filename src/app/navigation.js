import {
  CalendarDays,
  CarFront,
  CreditCard,
  ChartNoAxesCombined,
  CircleGauge,
  Flame,
  House,
  Landmark,
  ListChecks,
  PiggyBank,
  ReceiptText,
  Repeat2,
  Store,
  Tags,
  Target,
  TrendingUp,
  WalletCards,
  Waypoints,
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
      { id: 'transactions', label: 'Transactions', to: '/app/activity/transactions', icon: ReceiptText },
      { id: 'monthly', label: 'Monthly', to: '/app/activity/monthly', icon: CalendarDays },
      { id: 'subscriptions', label: 'Subscriptions', to: '/app/activity/subscriptions', icon: Repeat2 },
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
      { id: 'budget', label: 'Budget', to: '/app/planning/budget', icon: PiggyBank },
      { id: 'goals', label: 'Goals', to: '/app/planning/goals', icon: Target },
      { id: 'forecast', label: 'Forecast', to: '/app/planning/forecast', icon: TrendingUp },
      { id: 'rent', label: 'Rent calculator', to: '/app/planning/rent', icon: House },
      { id: 'car-lease', label: 'Car lease', to: '/app/planning/car-lease', icon: CarFront },
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
      { id: 'categories', label: 'Categories', to: '/app/insights/categories', icon: Tags },
      { id: 'vendors', label: 'Vendors', to: '/app/insights/vendors', icon: Store },
      { id: 'mappings', label: 'Mappings', to: '/app/insights/vendors#mappings', icon: Waypoints },
      { id: 'heatmap', label: 'Heatmap', to: '/app/insights/heatmap', icon: Flame },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Track balances, credit commitments, and private portfolio positions.',
    to: '/app/accounts/balances',
    icon: Landmark,
    matchPaths: ['/app/accounts'],
    children: [
      { id: 'balances', label: 'Balances', to: '/app/accounts/balances', icon: WalletCards },
      { id: 'income', label: 'Income & allocation', to: '/app/accounts/income', icon: Waypoints },
      { id: 'credit', label: 'Credit', to: '/app/accounts/credit', icon: CreditCard },
      { id: 'portfolio', label: 'Portfolio', to: '/app/accounts/portfolio', icon: ChartNoAxesCombined },
    ],
  },
];

export const LEGACY_APP_ROUTES = {
  monthly: '/app/activity/monthly',
  categories: '/app/insights/categories',
  vendors: '/app/insights/vendors',
  mappings: '/app/insights/vendors#mappings',
  transactions: '/app/activity/transactions',
  budget: '/app/planning/budget',
  heatmap: '/app/insights/heatmap',
  forecast: '/app/planning/forecast',
  rent: '/app/planning/rent',
  goals: '/app/planning/goals',
  recurring: '/app/activity/subscriptions',
  accounts: '/app/accounts/balances',
};

export function getActiveHub(pathname) {
  return APP_HUBS.find((hub) => hub.matchPaths.some((path) => (
    path === '/app' ? pathname === path : pathname.startsWith(path)
  ))) || null;
}
