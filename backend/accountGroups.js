export const ACCOUNT_GROUPS = ['bank', 'cash', 'investments', 'crypto', 'credit', 'other'];
export const ACCOUNT_GROUP_LABELS = {
  bank: 'Bank',
  cash: 'Cash',
  investments: 'Investments',
  crypto: 'Crypto',
  credit: 'Credit',
  other: 'Other',
};
// Used once for legacy records with no explicit group. Stored choices win.
export function suggestAccountGroup(name) {
  if (/\b(xtb|tradeville|tradeviile)\b/i.test(name)) return 'investments';
  if (/\b(cash|numerar)\b/i.test(name)) return 'cash';
  if (/\b(kraken|crypto|coinbase|binance)\b/i.test(name)) return 'crypto';
  if (/\bcredit\b/i.test(name)) return 'credit';
  if (/\b(bt|brd|ing|revolut|bcr|raiffeisen|unicredit|cec|banca|bank)\b/i.test(name)) return 'bank';
  return 'other';
}
export const accountGroup = (account) => account.group || suggestAccountGroup(account.name);
