import { accountGroup } from '../../backend/accountGroups.js';
import { convertAmountToDisplay } from './fx';
import { getAccountBalanceSnapshot, getPortfolioSummary, isExpenseTransaction, isRefundTransaction } from './selectors';
import { getCreditOverview } from './credit';

export function getRevolutTransactions(transactions, includeNormalized = false) {
  return transactions.filter(row => {
    const source = String(row.source || '').toLowerCase();
    const revolut = /^revolut(?:-|$)/.test(source);
    const normalized = includeNormalized && (source === 'master' || !source);
    // Top-ups, own-account transfers and currency exchange are not spending.
    const movement = /^(transfer|topup|top_up|exchange|currency_exchange)$/i.test(row.type || '');
    return (revolut || normalized) && !movement && (isExpenseTransaction(row) || isRefundTransaction(row));
  });
}

export function getOverviewPosition(data, includePortfolio = false) {
  const options = {displayCurrency: data.displayCurrency, fxRates: data.fxRates};
  const snapshot = getAccountBalanceSnapshot(data.accounts, options);
  const vendorDebt = (data.creditRecords || []).filter(row => row.kind === 'vendor')
    .reduce((sum, row) => sum + convertAmountToDisplay(row.remainingBalance, row.currency, data.displayCurrency, data.fxRates), 0);
  const portfolio = includePortfolio ? getPortfolioSummary(data.portfolioHoldings || [], options).totalMarketValue : 0;
  const credit = getCreditOverview(data);
  return {
    snapshot, portfolio, vendorDebt,
    netWorth: snapshot.total + portfolio - vendorDebt,
    missingCreditBalances: credit.missingBalances,
  };
}

export function getAccountGroups(data) {
  const options = {displayCurrency: data.displayCurrency, fxRates: data.fxRates};
  const month = getAccountBalanceSnapshot(data.accounts, options).month;
  const groups = Object.fromEntries(['shares', 'cash', 'bank', 'credits', 'other'].map(key => [key, {total: 0, accounts: [], missing: 0}]));
  for (const account of data.accounts) {
    const recorded = Object.keys(account.balances).filter(value => value <= month).sort().at(-1);
    const balance = recorded ? account.balances[recorded] : null;
    const assigned = accountGroup(account);
    const group = ({investments:'shares',credit:'credits',crypto:'other'})[assigned] || assigned;
    groups[group].accounts.push(account.name);
    if (balance === null) groups[group].missing += 1;
    else groups[group].total += convertAmountToDisplay(balance, account.currency || 'RON', group === 'shares' ? 'USD' : data.displayCurrency, data.fxRates);
  }
  return {...groups, month};
}

export function getNetWorthBreakdown(data, today = new Date()) {
  const month = getAccountBalanceSnapshot(data.accounts).month;
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const convert = (value, currency) => convertAmountToDisplay(value, currency, data.displayCurrency, data.fxRates);
  const rows = data.accounts.map(account => {
    const recorded = Object.keys(account.balances).filter(value => value <= month).sort().at(-1);
    const value = recorded ? account.balances[recorded] : null;
    const currency = account.currency || 'RON';
    return {id:account.id,name:account.name,group:accountGroup(account),date:recorded || null,value,currency,
      rate:convert(1,currency),contribution:value === null ? null : convert(value,currency),
      status:!recorded ? 'Missing — excluded' : recorded > currentMonth ? 'Future entry — review' : recorded < currentMonth ? 'Older balance — review' : 'Current month'};
  });
  for (const credit of (data.creditRecords || []).filter(row => row.kind === 'vendor')) rows.push({id:`vendor:${credit.id}`,name:credit.name || 'Vendor credit',group:'credit',date:null,value:-credit.remainingBalance,currency:credit.currency,rate:convert(1,credit.currency),contribution:-convert(credit.remainingBalance,credit.currency),status:'Vendor debt; balance date not recorded'});
  return rows;
}
