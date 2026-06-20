import { BASE_CURRENCY } from './fx';
import { serializeBackupState } from './persistence';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function datedFilename(extension) {
  return `simple_safe_banking_backup_${new Date().toISOString().split('T')[0]}.${extension}`;
}

export function exportJsonBackup(persistedState) {
  downloadBlob(
    new Blob([serializeBackupState(persistedState)], { type: 'application/json' }),
    datedFilename('json')
  );
}

export async function exportExcelWorkbook(data) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SimpleSafeBanking';
  workbook.created = new Date();

  const transactionSheet = workbook.addWorksheet('Transactions');
  transactionSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Description', key: 'desc', width: 28 },
    { header: 'Category', key: 'cat', width: 18 },
    { header: 'Subcategory', key: 'sub', width: 18 },
    { header: 'Amount', key: 'amt', width: 12 },
    { header: 'Flow', key: 'flow', width: 12 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'YearMonth', key: 'ym', width: 12 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Reference', key: 'ref', width: 20 },
    { header: 'Source', key: 'source', width: 12 },
    { header: 'MatchedVendor', key: 'matchedVendor', width: 20 },
    { header: 'MatchedAlias', key: 'matchedAlias', width: 20 },
    { header: 'MatchSource', key: 'matchSource', width: 18 },
    { header: 'MatchStrategy', key: 'matchStrategy', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 14 },
  ];
  data.transactions.forEach((transaction) => transactionSheet.addRow(transaction));

  const accountsSheet = workbook.addWorksheet('Accounts');
  const accountMonths = [...new Set(data.accounts.flatMap((account) => Object.keys(account.balances)))].sort();
  accountsSheet.columns = [
    { header: 'Account', key: 'name', width: 24 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'MonthlyContribution', key: 'monthlyContribution', width: 18 },
    ...accountMonths.map((month) => ({ header: month, key: month, width: 14 })),
  ];
  data.accounts.forEach((account) => accountsSheet.addRow({
    name: account.name,
    currency: account.currency || BASE_CURRENCY,
    monthlyContribution: account.monthlyContribution,
    ...account.balances,
  }));

  const vendorSheet = workbook.addWorksheet('Custom Vendors');
  vendorSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 24 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Subcategory', key: 'subcategory', width: 18 },
  ];
  Object.entries(data.customVendors).forEach(([vendor, [category, subcategory]]) => {
    vendorSheet.addRow({ vendor, category, subcategory });
  });

  const settingsSheet = workbook.addWorksheet('Settings');
  settingsSheet.columns = [
    { header: 'Key', key: 'key', width: 20 },
    { header: 'Value', key: 'value', width: 26 },
  ];
  settingsSheet.addRows([
    { key: 'BaseCurrency', value: data.baseCurrency },
    { key: 'DisplayCurrency', value: data.displayCurrency },
    { key: 'RonPerEur', value: data.fxRates?.EUR },
    { key: 'RonPerUsd', value: data.fxRates?.USD },
    { key: 'FxUpdatedAt', value: data.fxUpdatedAt ? new Date(data.fxUpdatedAt).toISOString() : '' },
    { key: 'FxSource', value: data.fxSource || '' },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    datedFilename('xlsx')
  );
}
